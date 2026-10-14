-- A listing is a product; order lines and reservations belong to physical units.
-- Keep the existing per-unit price snapshots and payment ledger. Quantity is the
-- number of unit lines, so allocation, hire pricing and invoice arithmetic agree.
alter table public.items add column available_quantity integer not null default 0 check (available_quantity>=0);
alter table public.items add constraint items_stock_quantity_bounded check (stock_quantity<=10000);
comment on column public.items.stock_quantity is 'Total tracked physical units, including held and sold units. NULL retains the legacy single-unit count. Reductions retire free units without reusing their numbers.';
comment on column public.items.available_quantity is 'Derived free unit count. Staff cannot write this count; only this aggregate is public.';

create table public.item_units (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  unit_number integer not null check (unit_number>0),
  code text not null unique,
  status public.item_status not null,
  sale_price_cents bigint check (sale_price_cents>=0),
  sold_at timestamptz,
  current_order_line_id uuid unique references public.order_lines(id) deferrable initially deferred,
  retired_at timestamptz,
  unique(item_id,unit_number),
  unique(id,item_id)
);
create index item_units_free_idx on public.item_units(item_id,unit_number)
  where retired_at is null and current_order_line_id is null;
alter table public.item_units enable row level security;
revoke all on public.item_units from public,anon,authenticated;
grant select on public.item_units to authenticated;
create policy "staff read physical units" on public.item_units for select to authenticated using ((select app.is_staff()));

-- Refuse ambiguous legacy holds instead of quietly choosing an order or
-- creating stock to make an inconsistent count work.
do $$ begin
  if exists(select 1 from public.order_lines l join public.orders o on o.id=l.order_id
    join public.items i on i.id=l.item_id
    where o.status in ('draft','paid') and not(o.kind='hire' and o.hire_returned_at is not null)
    group by i.id having count(*)>1 or coalesce(max(i.stock_quantity),1)=0) then
    raise exception 'Reconcile listings with conflicting live orders or zero stock on a live order before enabling unit inventory.';
  end if;
end $$;

insert into public.item_units(item_id,unit_number,code,status,sale_price_cents,sold_at)
select i.id,n,i.sku||'.'||n,
  case when n=1 or live.id is null then i.status else coalesce(live.held_from_status,'listed') end,
  case when n=1 then i.sale_price_cents end,case when n=1 then i.sold_at end
from public.items i
left join lateral (
  select l.id,l.held_from_status from public.order_lines l join public.orders o on o.id=l.order_id
  where l.item_id=i.id and o.status in ('draft','paid') and not(o.kind='hire' and o.hire_returned_at is not null)
  order by o.created_at desc limit 1
) live on true
cross join lateral generate_series(1,coalesce(i.stock_quantity,1)) n;
-- A retired identity preserves old paperwork for a listing now counted at zero.
insert into public.item_units(item_id,unit_number,code,status,retired_at)
select i.id,1,i.sku||'.1',i.status,now() from public.items i
where not exists(select 1 from public.item_units u where u.item_id=i.id)
  and exists(select 1 from public.order_lines l where l.item_id=i.id);

alter table public.order_lines add column item_unit_id uuid, add column unit_code text;
-- Stop invoice refreshes during the identity-only backfill. Issued documents
-- remain immutable and are not silently replaced by a migration.
alter table public.order_lines disable trigger guard_plan_lines;
alter table public.order_lines disable trigger lines_refresh_order;
update public.order_lines l set item_unit_id=u.id,unit_code=u.code
from public.item_units u where u.item_id=l.item_id and u.unit_number=1;
alter table public.order_lines enable trigger guard_plan_lines;
alter table public.order_lines enable trigger lines_refresh_order;
alter table public.order_lines alter column item_unit_id set not null, alter column unit_code set not null;
alter table public.order_lines drop constraint order_lines_order_id_item_id_key;
alter table public.order_lines add constraint order_lines_unit_listing_fk foreign key(item_unit_id,item_id) references public.item_units(id,item_id),
  add constraint order_lines_order_unit_key unique(order_id,item_unit_id);
create index order_lines_unit_idx on public.order_lines(item_unit_id);
update public.item_units u set current_order_line_id=l.id
from public.order_lines l join public.orders o on o.id=l.order_id
where l.item_unit_id=u.id and o.status in ('draft','paid') and not(o.kind='hire' and o.hire_returned_at is not null);
-- Unit writes, including direct line writes, have one transactional path.
revoke insert,update,delete on public.order_lines from authenticated;

create function app.unit_listing_status(p_item_id uuid,p_fallback public.item_status)
returns public.item_status language sql stable set search_path='' as $$
  select coalesce(
    (select u.status from public.item_units u where u.item_id=p_item_id and u.retired_at is null
      and u.current_order_line_id is null and u.status not in ('sold','handed_over','reserved')
      order by (u.status='listed') desc,u.unit_number limit 1),
    (select case when bool_or(u.status='reserved') then 'reserved'::public.item_status
      when bool_and(u.status in ('sold','handed_over')) then 'sold'::public.item_status end
      from public.item_units u where u.item_id=p_item_id and u.retired_at is null),p_fallback)
$$;
revoke all on function app.unit_listing_status(uuid,public.item_status) from public,anon,authenticated;

create function app.refresh_unit_listing(p_item_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.items i set
    status=app.unit_listing_status(i.id,i.status),
    available_quantity=(select count(*) from public.item_units u where u.item_id=i.id and u.retired_at is null
      and u.current_order_line_id is null and u.status not in ('sold','handed_over','reserved')),
    sale_price_cents=case when app.unit_listing_status(i.id,i.status) in ('sold','handed_over') then
      (select sum(u.sale_price_cents) from public.item_units u where u.item_id=i.id and u.retired_at is null and u.status in ('sold','handed_over')) end
  where i.id=p_item_id;
end $$;
revoke all on function app.refresh_unit_listing(uuid) from public,anon,authenticated;

-- Listing stage edits affect only free units; they cannot release a customer's
-- hold or rewrite another order's sold unit. Refreshes already match the units.
create function app.sync_item_units() returns trigger
language plpgsql security definer set search_path='' as $$
declare actual integer; target integer:=coalesce(new.stock_quantity,1); next_number integer; removable integer;
begin
  if tg_op='INSERT' or new.stock_quantity is distinct from old.stock_quantity then
    select count(*) into actual from public.item_units where item_id=new.id and retired_at is null;
    if target>actual then
      select coalesce(max(unit_number),0) into next_number from public.item_units where item_id=new.id;
      insert into public.item_units(item_id,unit_number,code,status)
      select new.id,n,new.sku||'.'||n,
        case when new.status in ('sold','handed_over','reserved') and tg_op='UPDATE' then 'listed'::public.item_status else new.status end
      from generate_series(next_number+1,next_number+target-actual) n;
    elsif target<actual then
      select count(*) into removable from public.item_units where item_id=new.id and retired_at is null
        and current_order_line_id is null and status not in ('sold','handed_over','reserved');
      if actual-target>removable then raise exception 'Cannot remove held or sold units. Release the order first; sold unit history must stay.'; end if;
      update public.item_units set retired_at=now() where id in (
        select id from public.item_units where item_id=new.id and retired_at is null
          and current_order_line_id is null and status not in ('sold','handed_over','reserved')
        order by unit_number desc limit actual-target);
    end if;
  end if;
  if tg_op='UPDATE' and new.status is distinct from old.status
    and new.status is distinct from app.unit_listing_status(new.id,new.status) then
    if not exists(select 1 from public.item_units where item_id=new.id and retired_at is null and current_order_line_id is null) then
      raise exception 'These units belong to an order. Change or cancel the order first.';
    end if;
    update public.item_units set status=new.status,
      sold_at=case when new.status in ('sold','handed_over') then coalesce(sold_at,now()) end,
      sale_price_cents=case when new.status in ('sold','handed_over') then new.sale_price_cents end
    where item_id=new.id and retired_at is null and current_order_line_id is null;
  end if;
  -- No recursive update when the unit aggregate is already on the listing.
  if new.status is distinct from app.unit_listing_status(new.id,new.status)
    or new.available_quantity<>(select count(*) from public.item_units where item_id=new.id and retired_at is null
      and current_order_line_id is null and status not in ('sold','handed_over','reserved')) then
    perform app.refresh_unit_listing(new.id);
  end if;
  return new;
end $$;
revoke all on function app.sync_item_units() from public,anon,authenticated;
create trigger items_sync_units after insert or update of stock_quantity,status on public.items for each row execute function app.sync_item_units();

create or replace function app.compute_website_availability() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.website_availability:=case
    when new.status not in ('listed','reserved') or new.deleted_at is not null then 'hidden'
    when new.available_quantity>0 then 'available'
    when exists(select 1 from public.item_units u join public.order_lines l on l.id=u.current_order_line_id join public.orders o on o.id=l.order_id
      where u.item_id=new.id and u.status='reserved' and o.status='paid' and o.kind='hire' and o.hire_returned_at is null) then 'on_hire'
    when exists(select 1 from public.item_units u left join public.order_lines l on l.id=u.current_order_line_id left join public.orders o on o.id=l.order_id
      where u.item_id=new.id and u.retired_at is null and u.status='reserved'
        and (o.id is null or (o.status='draft' and coalesce(o.purchase_option,o.sale_plan,'immediate') not in ('layby','asset_finance')))) then 'reserved'
    else 'hidden' end;
  return new;
end $$;

create or replace function app.refresh_order_availability() returns trigger
language plpgsql security definer set search_path='' as $$
declare iid uuid;
begin
  for iid in select distinct item_id from public.order_lines where order_id=new.id order by item_id loop
    perform app.refresh_unit_listing(iid);
  end loop;
  return new;
end $$;

create function app.hold_order_unit() returns trigger
language plpgsql security definer set search_path='' as $$
declare u public.item_units%rowtype;
begin
  -- Lock order -> listing -> unit everywhere, including direct owner writes.
  perform 1 from public.orders where id=new.order_id for update;
  perform 1 from public.items where id=new.item_id and deleted_at is null for update;
  if not found then raise exception 'This listing has been deleted.'; end if;
  select * into u from public.item_units where id=new.item_unit_id and item_id=new.item_id for update;
  if not found or u.retired_at is not null or u.current_order_line_id is not null or u.status in ('sold','handed_over','reserved') then
    raise exception 'This unit is no longer available. Refresh and choose available stock.';
  end if;
  new.unit_code:=u.code; new.held_from_status:=u.status;
  return new;
end $$;
create function app.bind_order_unit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.item_units set current_order_line_id=new.id,status='reserved' where id=new.item_unit_id;
  perform app.refresh_unit_listing(new.item_id);
  return new;
end $$;
create function app.release_deleted_order_unit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.items where id=old.item_id for update;
  update public.item_units set current_order_line_id=null,status=case when status in ('sold','reserved') then app.restore_status(status,old.held_from_status) else status end,sale_price_cents=null,sold_at=null
    where id=old.item_unit_id and current_order_line_id=old.id;
  perform app.refresh_unit_listing(old.item_id);
  return old;
end $$;
revoke all on function app.hold_order_unit(),app.bind_order_unit(),app.release_deleted_order_unit() from public,anon,authenticated;
create trigger lines_hold_unit before insert on public.order_lines for each row execute function app.hold_order_unit();
create trigger lines_bind_unit after insert on public.order_lines for each row execute function app.bind_order_unit();
create trigger lines_release_unit after delete on public.order_lines for each row execute function app.release_deleted_order_unit();

create or replace function app.guard_plan_lines() returns trigger
language plpgsql security definer set search_path='' as $$
declare oid uuid; confirmed timestamptz;
begin
  oid:=case when tg_op='INSERT' then new.order_id else old.order_id end;
  select plan_confirmed_at into confirmed from public.orders where id=oid for update;
  if tg_op='UPDATE' and row(new.order_id,new.item_id,new.item_unit_id,new.unit_code) is distinct from row(old.order_id,old.item_id,old.item_unit_id,old.unit_code) then
    raise exception 'An assigned unit cannot be replaced. Remove it and add an available unit.';
  end if;
  if confirmed is not null and (tg_op<>'UPDATE' or row(new.list_price_cents,new.retail_price_cents,new.position) is distinct from row(old.list_price_cents,old.retail_price_cents,old.position)) then
    raise exception 'Items on a confirmed payment plan are fixed. Cancel the agreement to release them.';
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;

-- Quantity is added atomically. There is never a partial success if stock runs
-- out, and the listing lock serializes competing staff members' allocations.
drop function public.add_order_line(uuid,text,uuid);
create function public.add_order_line(p_order_id uuid,p_code text default null,p_item_id uuid default null,p_quantity integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; i public.items%rowtype; u record; ids uuid[]; next_position integer; codes text[]:='{}'; v_code text;
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  if p_quantity is null or p_quantity not between 1 and 10000 then raise exception 'Choose a whole quantity between 1 and 10000.'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status<>'draft' or o.plan_confirmed_at is not null then raise exception 'Only an open, unconfirmed order can add units.'; end if;
  v_code:=app.normalise_item_code(split_part(p_code,'.',1));
  if p_item_id is not null then select * into i from public.items where id=p_item_id and deleted_at is null for update;
  else select * into i from public.items where sku=v_code and deleted_at is null for update; end if;
  if not found then raise exception 'No listing has that code.'; end if;
  select array_agg(f.id order by f.unit_number) into ids from (
    select id,unit_number from public.item_units where item_id=i.id and retired_at is null and current_order_line_id is null
      and status not in ('sold','handed_over','reserved')
      and (p_code is null or position('.' in p_code)=0 or lower(code)=lower(btrim(p_code)))
    order by unit_number limit p_quantity for update
  ) f;
  if coalesce(cardinality(ids),0)<p_quantity then raise exception '% has only % available unit(s). Choose a smaller quantity or refresh.',i.sku,coalesce(cardinality(ids),0); end if;
  select coalesce(max(position),-1)+1 into next_position from public.order_lines where order_id=p_order_id;
  for u in select * from public.item_units where id=any(ids) order by unit_number loop
    insert into public.order_lines(order_id,item_id,item_unit_id,unit_code,list_price_cents,retail_price_cents,position)
      values(p_order_id,i.id,u.id,u.code,coalesce(i.list_price_cents,0),i.retail_price_cents,next_position);
    codes:=codes||u.code; next_position:=next_position+1;
  end loop;
  return jsonb_build_object('item_id',i.id,'sku',i.sku,'title',i.title,'units',to_jsonb(codes),'quantity',p_quantity);
end $$;
revoke all on function public.add_order_line(uuid,text,uuid,integer) from public,anon;
grant execute on function public.add_order_line(uuid,text,uuid,integer) to authenticated;

-- A line id removes exactly one physical unit. Older two-argument clients
-- remove the first assigned unit, preserving the original one-unit action.
drop function public.remove_order_line(uuid,uuid);
create function public.remove_order_line(p_order_id uuid,p_item_id uuid,p_line_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; i public.items%rowtype; line_id uuid;
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status<>'draft' or o.plan_confirmed_at is not null then raise exception 'Only an open, unconfirmed order can remove units.'; end if;
  perform 1 from public.items where id=p_item_id for update;
  select id into line_id from public.order_lines where order_id=p_order_id and item_id=p_item_id and (p_line_id is null or id=p_line_id)
    order by position,id limit 1;
  delete from public.order_lines where id=line_id;
  if not found then raise exception 'That unit is not on this order.'; end if;
  select * into i from public.items where id=p_item_id;
  return jsonb_build_object('code',o.code,'item_id',i.id,'sku',i.sku,'status',i.status);
end $$;
revoke all on function public.remove_order_line(uuid,uuid,uuid) from public,anon;
grant execute on function public.remove_order_line(uuid,uuid,uuid) to authenticated;

-- Shared lifecycle guard. Ownership, not the listing's aggregate status,
-- decides whether these particular units can be paid for or reopened.
create or replace function app.refuse_unsellable_lines(p_order_id uuid) returns void
language plpgsql set search_path='' as $$
declare bad text;
begin
  perform 1 from public.items i where exists(select 1 from public.order_lines l where l.order_id=p_order_id and l.item_id=i.id) order by i.id for update;
  perform 1 from public.item_units u where exists(select 1 from public.order_lines l where l.order_id=p_order_id and l.item_unit_id=u.id) order by u.item_id,u.unit_number for update;
  select l.unit_code into bad from public.order_lines l join public.item_units u on u.id=l.item_unit_id join public.items i on i.id=l.item_id
    where l.order_id=p_order_id and (i.deleted_at is not null or u.retired_at is not null or u.current_order_line_id is distinct from l.id or u.status not in ('reserved')) limit 1;
  if found then raise exception '% is no longer held by this order. Refresh and check the stock.',bad; end if;
end $$;

create or replace function public.confirm_order_paid(p_order_id uuid,p_sold_total_cents bigint,p_method public.payment_method,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; l record; n integer; asking numeric; allocated bigint; running bigint:=0; idx integer:=0; ids uuid[];
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status<>'draft' or o.kind<>'sale' then raise exception 'Only an open sale can record this payment.'; end if;
  if o.lead_id is null or coalesce(p_sold_total_cents,0)<=0 or p_method is null then raise exception 'Add a customer, a positive goods total and a payment method first.'; end if;
  perform app.refuse_unsellable_lines(p_order_id);
  select count(*),sum(list_price_cents),array_agg(distinct item_id) into n,asking,ids from public.order_lines where order_id=p_order_id;
  if n=0 then raise exception 'There are no units on this order.'; end if;
  for l in select * from public.order_lines where order_id=p_order_id order by position,id loop
    idx:=idx+1;
    allocated:=case when idx=n then p_sold_total_cents-running when asking>0 then floor(p_sold_total_cents::numeric*l.list_price_cents/asking)::bigint else p_sold_total_cents/n end;
    running:=running+allocated;
    update public.order_lines set sold_price_cents=allocated where id=l.id;
    update public.item_units set status='sold',sale_price_cents=allocated,sold_at=now() where id=l.item_unit_id;
  end loop;
  update public.orders set status='paid',sold_total_cents=p_sold_total_cents,payment_method=p_method,payment_reference=nullif(btrim(p_reference),''),paid_at=now(),sold_by=auth.uid() where id=p_order_id returning * into o;
  insert into public.lead_events(lead_id,kind,body,item_id,actor_id) values(o.lead_id,'purchased',o.code||' · '||n||' unit(s) · '||app.rands_text(o.charged_total_cents),case when cardinality(ids)=1 then ids[1] end,auth.uid());
  update public.leads set status='customer' where id=o.lead_id and status<>'customer';
  return jsonb_build_object('code',o.code,'items',to_jsonb(ids),'sold_total_cents',o.sold_total_cents,'delivery_fee_cents',o.delivery_fee_cents,'charged_total_cents',o.charged_total_cents);
end $$;

create or replace function public.confirm_hire_paid(p_order_id uuid,p_method public.payment_method,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; n integer; days integer; total bigint; ids uuid[];
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status<>'draft' or o.kind<>'hire' then raise exception 'Only an open hire can record this payment.'; end if;
  days:=app.hire_days(o.hire_start,o.hire_end);
  if o.lead_id is null or days is null or p_method is null then raise exception 'A hire needs a customer, valid dates and a payment method.'; end if;
  perform app.refuse_unsellable_lines(p_order_id);
  select count(*),sum(public.hire_fee_cents(list_price_cents,days)),array_agg(distinct item_id) into n,total,ids from public.order_lines where order_id=p_order_id;
  if n=0 or coalesce(total,0)<=0 then raise exception 'Add priced units before confirming the hire.'; end if;
  update public.order_lines set sold_price_cents=public.hire_fee_cents(list_price_cents,days) where order_id=p_order_id;
  update public.orders set status='paid',sold_total_cents=total,payment_method=p_method,payment_reference=nullif(btrim(p_reference),''),paid_at=now(),sold_by=auth.uid() where id=p_order_id returning * into o;
  insert into public.lead_events(lead_id,kind,body,actor_id) values(o.lead_id,'note',o.code||' · hire · '||n||' unit(s) · '||days||' days · '||app.rands_text(o.charged_total_cents),auth.uid());
  update public.leads set status='customer' where id=o.lead_id and status<>'customer';
  return jsonb_build_object('code',o.code,'items',to_jsonb(ids),'days',days,'sold_total_cents',total,'delivery_fee_cents',o.delivery_fee_cents,'charged_total_cents',o.charged_total_cents);
end $$;

-- Release only units still owned by this order. A returned hire may already
-- have been allocated again; cancelling its old record cannot reclaim them.
create function app.release_order_units(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare iid uuid; restored jsonb;
begin
  perform 1 from public.items i where exists(select 1 from public.order_lines l where l.order_id=p_order_id and l.item_id=i.id) order by i.id for update;
  update public.item_units u set current_order_line_id=null,status=case when u.status in ('sold','reserved') then app.restore_status(u.status,l.held_from_status) else u.status end,sale_price_cents=null,sold_at=null
    from public.order_lines l where l.order_id=p_order_id and u.id=l.item_unit_id and u.current_order_line_id=l.id;
  for iid in select distinct item_id from public.order_lines where order_id=p_order_id order by item_id loop perform app.refresh_unit_listing(iid); end loop;
  select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'status',i.status)),'[]'::jsonb) into restored from public.items i
    where exists(select 1 from public.order_lines l where l.order_id=p_order_id and l.item_id=i.id);
  return restored;
end $$;
revoke all on function app.release_order_units(uuid) from public,anon,authenticated;

create or replace function public.void_order(p_order_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; restored jsonb; ids uuid[];
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  if coalesce(btrim(p_reason),'')='' then raise exception 'Say why this order is being cancelled.'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status='void' then raise exception 'This order is missing or already cancelled.'; end if;
  restored:=app.release_order_units(p_order_id);
  update public.order_lines set sold_price_cents=null where order_id=p_order_id;
  update public.orders set status='void',voided_at=now(),void_reason=btrim(p_reason) where id=p_order_id;
  select array_agg(distinct item_id) into ids from public.order_lines where order_id=p_order_id;
  if o.lead_id is not null and o.status='paid' then insert into public.lead_events(lead_id,kind,body,actor_id) values(o.lead_id,'note',o.code||' cancelled: '||btrim(p_reason),auth.uid()); end if;
  return jsonb_build_object('code',o.code,'items',to_jsonb(coalesce(ids,'{}')),'restore',restored);
end $$;

create or replace function public.return_hire(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; restored jsonb; ids uuid[];
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.kind<>'hire' or o.status<>'paid' or o.hire_returned_at is not null then raise exception 'Only an outstanding paid hire can be returned.'; end if;
  restored:=app.release_order_units(p_order_id);
  update public.orders set hire_returned_at=now() where id=p_order_id;
  select array_agg(distinct item_id) into ids from public.order_lines where order_id=p_order_id;
  if o.lead_id is not null then insert into public.lead_events(lead_id,kind,body,actor_id) values(o.lead_id,'note',o.code||' · hire returned',auth.uid()); end if;
  return jsonb_build_object('code',o.code,'items',to_jsonb(coalesce(ids,'{}')),'restore',restored);
end $$;

create or replace function public.reopen_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; ids uuid[];
begin
  if not app.at_least('manager') then raise exception 'Reopening a paid order needs the manager role.' using errcode='insufficient_privilege'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if o.hire_returned_at is not null then raise exception 'A returned hire cannot be reopened. Its units are already back in stock.'; end if;
  if not found or o.status<>'paid' or o.hire_returned_at is not null or o.plan_confirmed_at is not null then raise exception 'Only a paid, unreturned order without confirmed payment terms can reopen.'; end if;
  perform 1 from public.items i where exists(select 1 from public.order_lines l where l.order_id=p_order_id and l.item_id=i.id) order by i.id for update;
  if exists(select 1 from public.order_lines l join public.item_units u on u.id=l.item_unit_id where l.order_id=p_order_id and u.current_order_line_id is distinct from l.id) then raise exception 'A unit is no longer held by this order.'; end if;
  update public.item_units u set status='reserved',sale_price_cents=null,sold_at=null from public.order_lines l where l.order_id=p_order_id and u.id=l.item_unit_id;
  update public.order_lines set sold_price_cents=null where order_id=p_order_id;
  update public.orders set status='draft',sold_total_cents=null,payment_method=null,payment_reference=null,paid_at=null where id=p_order_id;
  select array_agg(distinct item_id) into ids from public.order_lines where order_id=p_order_id;
  if o.lead_id is not null then insert into public.lead_events(lead_id,kind,body,actor_id) values(o.lead_id,'note',o.code||' reopened to correct the amount — it was '||app.rands_text(o.sold_total_cents),auth.uid()); end if;
  return jsonb_build_object('code',o.code,'items',to_jsonb(coalesce(ids,'{}')));
end $$;


-- Keep the existing order and payment guards, scoped to the assigned unit.

create or replace function app.orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.code       := coalesce(nullif(btrim(new.code), ''), app.next_order_code());
    new.created_by := coalesce(new.created_by, (select auth.uid()));
  else
    new.code       := old.code;
    new.created_at := old.created_at;
    new.created_by := old.created_by;

    if old.status = 'paid' and new.status = 'draft'
       and exists (
         select 1
         from public.order_lines l
         join public.item_units i on i.id = l.item_unit_id
         where l.order_id = new.id and i.status = 'sold'
       ) then
      raise exception
        'A paid order cannot be edited back into a draft while its machines are still sold. Use reopen_order().'
        using errcode = 'check_violation';
    end if;

    if old.status = 'void' and new.status <> 'void' then
      raise exception 'A voided order stays voided. Start a new one.'
        using errcode = 'check_violation';
    end if;

    if new.kind is distinct from old.kind
       and (old.status <> 'draft' or old.sold_by is not null or old.plan_confirmed_at is not null) then
      raise exception 'A confirmed order cannot change purchase option.' using errcode = 'check_violation';
    end if;
  end if;

  if new.kind = 'sale' then
    new.hire_start       := null;
    new.hire_end         := null;
    new.hire_returned_at := null;
  elsif new.status = 'draft' then
    new.sold_total_cents:=case when app.hire_days(new.hire_start,new.hire_end) is not null then
      (select sum(public.hire_fee_cents(l.list_price_cents,app.hire_days(new.hire_start,new.hire_end))) from public.order_lines l where l.order_id=new.id)
      else null end;
  end if;

  new.delivery_fee_cents := case
    when new.delivery then public.delivery_fee_cents(new.delivery_km)
    else 0
  end;

  if new.purchase_option is distinct from 'asset_finance' then
    new.installation_quote_cents:=null; new.installation_accepted:=false;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- A separate invoice row per physical unit prints every assigned number.

create or replace function public.issue_invoice(
  p_order_id uuid,
  p_kind     text,
  p_issuer   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order      public.orders%rowtype;
  v_lead       public.leads%rowtype;
  v_days       integer;
  v_lines      jsonb;
  v_count      integer;
  v_subtotal   bigint;
  v_agreed     bigint;
  v_adjustment bigint;
  v_delivery   jsonb;
  v_hire       jsonb;
  v_fee        bigint;
  v_total      bigint;
  v_number     text;
  v_latest     public.order_invoices%rowtype;
  v_supersedes uuid;
  v_terms      integer;
  v_issued     timestamptz := now();
  v_document   jsonb;
  v_id         uuid;
  v_received bigint;
  v_payments jsonb;
  v_charges jsonb;
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  if p_kind not in ('proforma', 'invoice') then
    raise exception '% is not a kind of document this issues.', coalesce(p_kind, '(nothing)')
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_issuer ->> 'legal_name'), '') = ''
     or coalesce(btrim(p_issuer ->> 'registration_number'), '') = ''
     or coalesce(btrim(p_issuer ->> 'address'), '') = '' then
    raise exception
      'The business details for the invoice are not configured. Set BUSINESS_LEGAL_NAME, BUSINESS_REGISTRATION_NUMBER and BUSINESS_TRADING_ADDRESS.'
      using errcode = 'check_violation';
  end if;

  if p_issuer ->> 'registration_number' !~ '^[0-9]{4}/[0-9]{6}/[0-9]{2}$'
     or p_issuer ->> 'registration_number' ~ '^0{4}/0{6}/0{2}$' then
    raise exception
      'BUSINESS_REGISTRATION_NUMBER is not a CIPC registration number. It looks like 2026/328785/07, and it must be this company''s own.'
      using errcode = 'check_violation';
  end if;

  if p_issuer ? 'vat_number' then
    raise exception
      'This system issues invoices, not tax invoices, and cannot show VAT. Registering for VAT means recalculating sales already recorded — do that work before setting a VAT number.'
      using errcode = 'feature_not_supported';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;

  if v_order.status = 'void' then
    raise exception 'This sale was cancelled. There is nothing to invoice.'
      using errcode = 'check_violation';
  end if;

  if p_kind='invoice' and v_order.status<>'paid' and app.order_received_cents(p_order_id)=0 then
    raise exception 'Record a payment first. Until then it is a proforma.' using errcode='check_violation';
  end if;
  if p_kind='proforma' and v_order.status='paid' then
    raise exception 'This order has a payment record. Issue the invoice instead.' using errcode='check_violation';
  end if;

  if v_order.lead_id is null then
    raise exception 'An invoice needs somebody to be addressed to. Put the customer on the order first.'
      using errcode = 'check_violation';
  end if;

  select * into v_lead from public.leads where id = v_order.lead_id;

  if v_order.kind = 'hire' then
    v_days := app.hire_days(v_order.hire_start, v_order.hire_end);
    if v_days is null then
      raise exception 'A hire needs the day it goes out and the day it comes back before it can be invoiced.'
        using errcode = 'check_violation';
    end if;

    select
      jsonb_agg(
        jsonb_build_object(
          'code',        l.unit_code,
          'description', btrim(concat_ws(' ', i.brand, i.title))
                         || ' · hire, ' || v_days || ' day' || case when v_days = 1 then '' else 's' end
                         || ': ' || least(v_days,7) || ' x R' || to_char(public.hire_daily_rate_cents(l.list_price_cents)/100.0,'FM999999999990.00')
                         || case when v_days>7 then ' + ' || (v_days-7) || ' x R' || to_char(round(public.hire_daily_rate_cents(l.list_price_cents)*85/100.0)/100.0,'FM999999999990.00') else '' end,
          'qty',         1,
          'unit_cents',  public.hire_fee_cents(l.list_price_cents, v_days),
          'total_cents', public.hire_fee_cents(l.list_price_cents, v_days)
        )
        order by l.position, l.id
      ),
      count(*),
      coalesce(sum(public.hire_fee_cents(l.list_price_cents, v_days)), 0)
    into v_lines, v_count, v_subtotal
    from public.order_lines l
    join public.items i on i.id = l.item_id
    where l.order_id = p_order_id;

    v_hire := jsonb_build_object('start', v_order.hire_start, 'end', v_order.hire_end, 'days', v_days);
  else
    select
      jsonb_agg(
        jsonb_build_object(
          'code',        l.unit_code,
          'description', btrim(concat_ws(' ', i.brand, i.title)),
          'qty',         1,
          'unit_cents',  l.list_price_cents,
          'total_cents', l.list_price_cents
        )
        order by l.position, l.id
      ),
      count(*),
      coalesce(sum(l.list_price_cents), 0)
    into v_lines, v_count, v_subtotal
    from public.order_lines l
    join public.items i on i.id = l.item_id
    where l.order_id = p_order_id;

    v_hire := null;
  end if;

  if coalesce(v_count, 0) = 0 then
    raise exception 'There are no machines on this order to invoice.'
      using errcode = 'check_violation';
  end if;

  v_agreed     := coalesce(v_order.sold_total_cents, v_subtotal);
  v_adjustment := v_agreed - v_subtotal;
  v_fee        := v_order.delivery_fee_cents;
  v_total      := v_agreed+v_fee
    +case when v_order.installation_accepted then coalesce(v_order.installation_quote_cents,0) else 0 end;
  v_received:=app.order_received_cents(p_order_id);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'amount_cents',amount_cents,'entry_kind',entry_kind,
    'method',method,'reference',reference,'received_on',received_on,'recorded_at',recorded_at)
    order by recorded_at,id),'[]'::jsonb) into v_payments from public.order_receipts where order_id=p_order_id;
  v_charges:=jsonb_build_object('installation_cents',case when v_order.installation_accepted then coalesce(v_order.installation_quote_cents,0) else 0 end);

  if v_order.sold_total_cents is not null and v_total <> v_order.charged_total_cents then
    raise exception
      'The invoice total (%) does not match what the order says the customer pays (%). Refusing to issue.',
      v_total, v_order.charged_total_cents
      using errcode = 'check_violation';
  end if;

  v_delivery := case
    when v_order.delivery then jsonb_build_object(
      'address',   v_order.delivery_address,
      'km',        v_order.delivery_km,
      'fee_cents', v_fee
    )
    else null
  end;

  v_terms := greatest(coalesce((p_issuer ->> 'terms_days')::integer, 0), 0);

  v_document := jsonb_build_object(
    'kind',       p_kind,
    'order_code', v_order.code,
    'issuer',     p_issuer,
    'customer',   jsonb_build_object(
                    'name',     v_lead.full_name,
                    'business', v_lead.business_name,
                    'phone',    v_lead.phone,
                    'email',    v_lead.email,
                    'address',  v_lead.billing_address
                  ),
    'lines',      v_lines,
    'hire',       v_hire,
    'note',       nullif(btrim(coalesce(v_order.notes, '')), ''),
    'subtotal_cents',   v_subtotal,
    'adjustment_cents', v_adjustment,
    'delivery',         v_delivery,
    'total_cents',      v_total,
    'charges',          v_charges,
    'payments',         v_payments,
    'deposit_cents',    v_order.plan_deposit_cents,
    'received_cents',   v_received,
    'balance_cents',    greatest(v_total-v_received,0),
    'refund_due_cents', greatest(v_received-v_total,0),
    'payment',    case
                    when v_order.status = 'paid' then jsonb_build_object(
                      'method',    v_order.payment_method,
                      'reference', v_order.payment_reference,
                      'paid_at',   v_order.paid_at
                    )
                    else null
                  end
  );

  select * into v_latest
  from public.order_invoices
  where order_id = p_order_id and kind = p_kind
  order by issued_at desc, number desc
  limit 1;

  if v_latest.id is not null
     and v_latest.total_cents = v_total
     and (v_latest.document - 'number' - 'issued_at' - 'due_at') = v_document then
    return jsonb_build_object(
      'id',          v_latest.id,
      'number',      v_latest.number,
      'kind',        p_kind,
      'total_cents', v_latest.total_cents,
      'supersedes',  null,
      'reused',      true
    );
  end if;

  v_supersedes := v_latest.id;
  v_number     := app.next_document_number(p_kind);

  v_document := v_document || jsonb_build_object(
    'number',    v_number,
    'issued_at', v_issued,
    'due_at',    case
                   when v_received>=v_total then coalesce(v_order.paid_at,v_issued)
                   when v_order.plan_final_due is not null then v_order.plan_final_due::timestamp at time zone 'Africa/Johannesburg'
                   else v_issued + make_interval(days => v_terms)
                 end
  );

  insert into public.order_invoices (order_id, kind, number, document, total_cents, supersedes, issued_by)
  values (p_order_id, p_kind, v_number, v_document, v_total, v_supersedes, (select auth.uid()))
  returning id into v_id;

  insert into public.lead_events (lead_id, kind, body, actor_id)
  values (
    v_order.lead_id,
    'note',
    v_number || ' issued for ' || v_order.code
      || ' · ' || app.rands_text(v_total)
      || case when p_kind = 'proforma' then ' · awaiting payment' else '' end,
    (select auth.uid())
  );

  return jsonb_build_object(
    'id',          v_id,
    'number',      v_number,
    'kind',        p_kind,
    'total_cents', v_total,
    'supersedes',  v_supersedes,
    'reused',      false
  );
end;
$$;

drop function public.search_sellable_items(text,integer,uuid);

create function public.search_sellable_items(
  p_query    text,
  p_limit    integer default 10,
  p_order_id uuid default null
)
returns table (
  id                 uuid,
  sku                text,
  title              text,
  subtitle           text,
  status             text,
  list_price_cents   bigint,
  retail_price_cents bigint,
  on_order           text,
  rank               integer,
  available_quantity integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_needle text := btrim(coalesce(p_query, ''));
  v_like   text;
  v_limit  integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_code   text := app.normalise_item_code(p_query);
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  if length(v_needle) < 2 then
    return;
  end if;

  v_like := '%' || replace(replace(replace(
              lower(extensions.unaccent(v_needle)),
              '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    i.id,
    i.sku,
    i.title,
    concat_ws(' · ',
      nullif(concat_ws(' ', i.brand, i.model), '')
    )::text,
    i.status::text,
    i.list_price_cents,
    i.retail_price_cents,
    case when i.available_quantity=0 then live.code end,
    case
      when v_code is not null and i.sku = v_code                       then 0
      when lower(extensions.unaccent(i.sku))   like v_like             then 1
      when lower(extensions.unaccent(i.title)) like v_like             then 2
      else 3
    end,
    i.available_quantity
  from public.items i
  left join lateral (
    select o.code
    from public.order_lines l
    join public.orders o on o.id = l.order_id
    where l.item_id = i.id
      and o.status in ('draft', 'paid')
      and not (o.kind = 'hire' and o.hire_returned_at is not null)
      and (p_order_id is null or o.id <> p_order_id)
    limit 1
  ) live on true
  where i.deleted_at is null
    and i.status <> 'sold'
    and (
      (v_code is not null and i.sku = v_code)
      or lower(extensions.unaccent(i.sku))                  like v_like escape '\'
      or lower(extensions.unaccent(i.title))                like v_like escape '\'
      or lower(extensions.unaccent(coalesce(i.brand, '')))  like v_like escape '\'
      or lower(extensions.unaccent(coalesce(i.model, '')))  like v_like escape '\'
    )
  order by 9, 3
  limit v_limit;
end;
$$;

revoke all on function public.search_sellable_items(text,integer,uuid) from public,anon;
grant execute on function public.search_sellable_items(text,integer,uuid) to authenticated;

grant select(available_quantity) on public.items to anon;

create or replace view public.public_items
with (security_invoker = true) as
select
  i.id,
  i.sku,
  i.slug,
  i.title,
  i.brand,
  i.model,
  d.slug as division_slug,
  d.name as division_name,
  c.slug as category_slug,
  c.name as category_name,
  s.slug as subcategory_slug,
  s.name as subcategory_name,
  i.condition_grade,
  i.description,
  null::text[] as workshop_notes,
  i.capacity,
  i.power,
  i.specs,
  i.width_mm,
  i.depth_mm,
  i.height_mm,
  i.weight_kg,
  i.list_price_cents,
  i.retail_price_cents,
  i.sale_price_cents,
  i.status,
  i.published_at,
  i.featured,
  i.sold_at,
  -- The badge the card renders. A handed-over machine is still "sold" to a
  -- visitor; the distinction between the two is an internal one.
  (i.status in ('sold', 'handed_over')) as sold,
  photo.storage_path as primary_image_path,
  photo.external_url as primary_image_url,
  coalesce(tags.slugs, '{}') as tag_slugs,
  i.website_availability as availability,
  i.available_quantity
from public.items i
-- INNER join, deliberately: the publish gate guarantees a published item has a
-- category, so this both reads correctly and asserts the invariant.
join public.categories c on c.id = i.category_id
-- Also INNER, and safe to be: categories.division_id is NOT NULL, so every
-- category that reaches this line has a division.
join public.divisions d on d.id = c.division_id
-- LEFT, unlike the two above: a subcategory is optional and no publish rule
-- demands one, so an inner join here would silently hide stock from the site.
left join public.subcategories s on s.id = i.subcategory_id
left join lateral (
  select m.storage_path, m.external_url
  from public.item_media m
  where m.item_id = i.id and m.kind = 'photo'
  order by m.position, m.id
  limit 1
) photo on true
left join lateral (
  select array_agg(t.slug order by t.position, t.slug) as slugs
  from public.item_tags it
  join public.tags t on t.id = it.tag_id
  where it.item_id = i.id
) tags on true
where i.published_at is not null
  and i.deleted_at is null and i.website_availability<>'hidden';



-- Preserve all previously editable listing fields except calculated aggregates.
revoke update on public.items from authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(column_name),',') into cols from information_schema.columns
    where table_schema='public' and table_name='items' and column_name not in ('available_quantity','website_availability');
  execute 'grant update ('||cols||') on public.items to authenticated';
end $$;

create or replace function app.refresh_order_after_lines() returns trigger
language plpgsql security definer set search_path='' as $$
declare oid uuid; delta bigint:=0;
begin
  oid:=case when tg_op='DELETE' then old.order_id else new.order_id end;
  delta:=case when tg_op='INSERT' then new.list_price_cents when tg_op='DELETE' then -old.list_price_cents else new.list_price_cents-old.list_price_cents end;
  update public.orders set sold_total_cents=case when kind='sale' and status='draft' and sold_total_cents is not null then greatest(0,sold_total_cents+delta) else sold_total_cents end,
    updated_at=now() where id=oid;
  perform app.refresh_order_invoice(oid);
  if tg_op='DELETE' then return old; end if; return new;
end $$;

-- Costs remain the existing listing ledger. Split each kind over its physical
-- units to the cent, so selling two units neither repeats the entire batch cost
-- twice nor delays all revenue until the last unit sells.
create function app.unit_cost_share(p_cents bigint,p_position bigint,p_count bigint)
returns bigint language sql immutable set search_path='' as $$
  select (floor(p_cents::numeric*p_position/p_count)-floor(p_cents::numeric*(p_position-1)/p_count))::bigint
$$;
revoke all on function app.unit_cost_share(bigint,bigint,bigint) from public,anon;
grant execute on function app.unit_cost_share(bigint,bigint,bigint) to authenticated;
create view public.unit_costs with (security_invoker=true) as
with units as (
  select id,item_id,row_number() over(partition by item_id order by unit_number) as pos,
    count(*) over(partition by item_id) as n from public.item_units where retired_at is null
), costs as (
  select u.id,u.item_id,
    app.unit_cost_share(coalesce(sum(c.amount_cents) filter(where kind='auction'),0)::bigint,u.pos,u.n) as auction,
    app.unit_cost_share(coalesce(sum(c.amount_cents) filter(where kind='buyers_premium'),0)::bigint,u.pos,u.n) as premium,
    app.unit_cost_share(coalesce(sum(c.amount_cents) filter(where kind='workshop'),0)::bigint,u.pos,u.n) as workshop,
    app.unit_cost_share(coalesce(sum(c.amount_cents) filter(where kind='parts'),0)::bigint,u.pos,u.n) as parts,
    app.unit_cost_share(coalesce(sum(c.amount_cents) filter(where kind='labour'),0)::bigint,u.pos,u.n) as labour,
    app.unit_cost_share(coalesce(sum(c.amount_cents) filter(where kind='transport'),0)::bigint,u.pos,u.n) as delivery,
    app.unit_cost_share(coalesce(sum(c.amount_cents) filter(where kind='other'),0)::bigint,u.pos,u.n) as other,
    coalesce(sum(c.labour_hours),0)::numeric/u.n as labour_hours
  from units u left join public.item_costs c on c.item_id=u.item_id
  where (select app.can_see_costs()) group by u.id,u.item_id,u.pos,u.n
)
select *, (auction+premium+workshop+parts+labour+delivery+other)::bigint as total from costs;
revoke all on public.unit_costs from public,anon,authenticated;
grant select on public.unit_costs to authenticated;

create or replace view public.order_line_economics with (security_invoker=true) as
select l.order_id,l.id as line_id,l.item_id,l.position,l.unit_code as sku,i.title,u.status,
  l.list_price_cents,l.retail_price_cents,l.sold_price_cents,
  (c.auction+c.premium)::bigint as cost_purchase_cents,
  (c.workshop+c.parts+c.labour)::bigint as cost_refurb_cents,
  (c.delivery+c.other)::bigint as cost_other_cents,c.total as cost_total_cents
from public.order_lines l join public.items i on i.id=l.item_id join public.item_units u on u.id=l.item_unit_id
left join public.unit_costs c on c.id=u.id where (select app.can_see_costs());
comment on view public.order_line_economics is 'Existing listing costs allocated to physical units, read live. Grouped kinds and total sum to the listing ledger.';


-- The dashboard continues to count and price physical units.

create or replace view public.item_analytics
with (security_invoker = true) as
select
  i.id                                       as item_id,
  u.code as sku,
  i.title,
  u.status,
  i.arrived_at,
  u.sold_at,
  i.created_at,
  i.published_at,

  cat.id                                     as category_id,
  coalesce(cat.name, 'Uncategorised')        as category,
  sub.id                                     as subcategory_id,
  -- Not 'Uncategorised': a machine can legitimately sit in a category with no
  -- second level chosen, and calling that the same thing as having no category
  -- would merge two different states in the dashboard's own grouping.
  coalesce(sub.name, 'Unspecified')          as subcategory,

  (u.sold_at is not null)                    as is_sold,

  -- The price this unit is carrying: what it sold for, or failing that what it
  -- is asking. Present on unsold stock too, which is what makes "margin at
  -- asking" expressible without a second view.
  coalesce(u.sale_price_cents, i.list_price_cents, 0)::bigint as price_cents,

  -- Revenue is money that has actually arrived. An unsold machine contributes
  -- nothing to it however confident its asking price looks.
  case when u.sold_at is not null
       then coalesce(u.sale_price_cents, i.list_price_cents, 0)
       else 0 end::bigint                    as revenue_cents,

  -- ── The cost ledger, split by kind ──────────────────────────────────────
  -- The dashboard's cost breakdown is the reason this view exists at all.
  -- `transport` is what the intake form calls delivery; the column is named
  -- for the concept the reader has, not for the enum label.
  costs.total                                as cost_cents,
  costs.auction                              as cost_auction_cents,
  costs.workshop                             as cost_workshop_cents,
  costs.delivery                             as cost_delivery_cents,
  costs.parts                                as cost_parts_cents,
  costs.labour                               as cost_labour_cents,
  costs.premium                              as cost_premium_cents,
  costs.other                                as cost_other_cents,
  costs.labour_hours,

  -- Margin, both senses. Realised is only real once sold; unrealised is what
  -- the floor is currently promising. Keeping them in separate columns stops
  -- the browser adding a hope to a fact.
  case when u.sold_at is not null
       then coalesce(u.sale_price_cents, i.list_price_cents, 0) - costs.total
       else 0 end::bigint                    as margin_cents,
  case when u.sold_at is null
       then coalesce(u.sale_price_cents, i.list_price_cents, 0) - costs.total
       else 0 end::bigint                    as unrealised_margin_cents,
  -- Capital parked in this unit right now. Zero once it has sold.
  case when u.sold_at is null then costs.total else 0 end::bigint
                                             as tied_up_cents,

  -- ── Rotation ────────────────────────────────────────────────────────────
  -- Two different questions that look like one. days_to_sale is history and
  -- only exists for sold units; days_on_shelf is the clock still running on
  -- everything else. Averaging them together would flatter a floor full of
  -- machines that have not moved, because the ones that never sell never
  -- contribute a days_to_sale at all.
  case when u.sold_at is not null then (u.sold_at::date - i.arrived_at) end
                                             as days_to_sale,
  case when u.sold_at is null then (current_date - i.arrived_at) end
                                             as days_on_shelf
from public.items i
join public.item_units u on u.item_id=i.id and u.retired_at is null
left join public.categories cat    on cat.id = i.category_id
left join public.subcategories sub on sub.id = i.subcategory_id
left join public.unit_costs costs on costs.id=u.id
where i.deleted_at is null
  and (select app.can_see_costs());


create or replace view public.money_by_month
with (security_invoker = true) as
select
  date_trunc('month', u.sold_at)::date          as month,
  count(*)::integer                             as units_sold,
  coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents)), 0)::bigint
                                                as revenue_cents,
  coalesce(sum(costs.total), 0)::bigint         as cost_cents,
  coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents)), 0)::bigint
    - coalesce(sum(costs.total), 0)::bigint     as margin_cents,
  -- Rounded to one decimal, matching item_economics.margin_percent, so the
  -- summary and the per-unit table cannot appear to disagree over rounding.
  case
    when coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents)), 0) > 0
      then round(
        ((coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents)), 0)
          - coalesce(sum(costs.total), 0))::numeric
         / coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents)), 0)) * 100, 1)
  end                                           as margin_percent,
  round(avg(u.sold_at::date - i.arrived_at)::numeric, 1) as avg_days_to_sale
from public.items i
join public.item_units u on u.item_id=i.id and u.retired_at is null
left join public.unit_costs costs on costs.id=u.id
where i.deleted_at is null
  and u.sold_at is not null
  and (select app.can_see_costs())
group by 1;

create or replace view public.money_by_category
with (security_invoker = true) as
select
  coalesce(cat.name, 'Uncategorised')            as category,
  cat.id                                         as category_id,
  count(*)::integer                              as units_total,
  count(*) filter (where u.sold_at is not null)::integer  as units_sold,
  count(*) filter (where u.sold_at is null
                     and u.status <> 'sold')::integer     as units_in_stock,

  -- Sell-through: of everything we have taken in for this category, what share
  -- has left. The single most useful number for deciding what to buy next.
  case
    when count(*) > 0
      then round((count(*) filter (where u.sold_at is not null))::numeric
                 / count(*)::numeric * 100, 1)
  end                                            as sell_through_percent,

  coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents))
             filter (where u.sold_at is not null), 0)::bigint as revenue_cents,
  coalesce(sum(costs.total) filter (where u.sold_at is not null), 0)::bigint
                                                 as cost_cents,
  coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents))
             filter (where u.sold_at is not null), 0)::bigint
    - coalesce(sum(costs.total) filter (where u.sold_at is not null), 0)::bigint
                                                 as margin_cents,

  -- Capital currently parked in this category. The number that answers
  -- "why is there no cash" better than any of the others here.
  coalesce(sum(costs.total) filter (where u.sold_at is null), 0)::bigint
                                                 as tied_up_cents,
  round(avg(u.sold_at::date - i.arrived_at) filter (where u.sold_at is not null)::numeric, 1)
                                                 as avg_days_to_sale
from public.items i
join public.item_units u on u.item_id=i.id and u.retired_at is null
left join public.categories cat on cat.id = i.category_id
left join public.unit_costs costs on costs.id=u.id
where i.deleted_at is null
  and (select app.can_see_costs())
group by cat.id, cat.name;

create or replace view public.money_position
with (security_invoker = true) as
select
  count(*) filter (where u.sold_at is null and u.status <> 'sold')::integer
                                                     as units_in_stock,
  coalesce(sum(costs.total) filter (where u.sold_at is null), 0)::bigint
                                                     as tied_up_cents,
  coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents) - costs.total)
             filter (where u.sold_at is null), 0)::bigint
                                                     as unrealised_margin_cents,

  count(*) filter (where u.sold_at is not null)::integer      as units_sold_all_time,
  coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents))
             filter (where u.sold_at is not null), 0)::bigint as revenue_all_time_cents,
  coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents) - costs.total)
             filter (where u.sold_at is not null), 0)::bigint as margin_all_time_cents,

  count(*) filter (where u.sold_at >= now() - interval '30 days')::integer
                                                     as units_sold_30d,
  coalesce(sum(coalesce(u.sale_price_cents, i.list_price_cents) - costs.total)
             filter (where u.sold_at >= now() - interval '30 days'), 0)::bigint
                                                     as margin_30d_cents,

  round(avg(u.sold_at::date - i.arrived_at) filter (where u.sold_at is not null)::numeric, 1)
                                                     as avg_days_to_sale,

  count(*) filter (
    where u.sold_at is null
      and u.status <> 'sold'
      and i.arrived_at < current_date - 90
  )::integer                                         as aged_units,
  coalesce(sum(costs.total) filter (
    where u.sold_at is null
      and u.status <> 'sold'
      and i.arrived_at < current_date - 90
  ), 0)::bigint                                      as aged_stock_cents
from public.items i
join public.item_units u on u.item_id=i.id and u.retired_at is null
left join public.unit_costs costs on costs.id=u.id
where i.deleted_at is null
  and (select app.can_see_costs());


create or replace view public.item_economics with (security_invoker=true) as
select i.id as item_id,i.sku,i.slug,i.title,i.status,i.arrived_at,i.sold_at,i.list_price_cents,i.sale_price_cents,
  costs.total as total_cost_cents,(prices.total-costs.total)::bigint as margin_cents,
  case when prices.total>0 then round((prices.total-costs.total)::numeric/prices.total*100,1) end as margin_percent,
  case when i.sold_at is not null then i.sold_at::date-i.arrived_at end as days_to_sale
from public.items i left join lateral(select coalesce(sum(c.amount_cents),0)::bigint as total from public.item_costs c where c.item_id=i.id) costs on true
left join lateral(select sum(coalesce(u.sale_price_cents,i.list_price_cents,0))::bigint as total from public.item_units u where u.item_id=i.id and u.retired_at is null) prices on true
where i.deleted_at is null and (select app.can_see_costs());

-- Recalculate only stock aggregates, without changing existing order amounts,
-- receipts, issued invoices, unit identities or publication decisions.
do $$ declare iid uuid; begin
  for iid in select id from public.items order by id loop perform app.refresh_unit_listing(iid); end loop;
end $$;


-- A manual zero count must not queue unavailable stock for outreach.
create or replace function public.match_item_to_leads(p_item_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item      public.items;
  v_doc_words text[];
  v_item_tags uuid[];
  v_queued    integer := 0;
begin
  -- Reachable two ways: a signed-in staff member changing an item's stage, and
  -- the nightly sweep running with the service key, which has no auth.uid() at
  -- all. Anyone else fails at the grant — execute is revoked from public and
  -- never given to anon.
  if (select auth.uid()) is not null and not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  select * into v_item from public.items where id = p_item_id;
  if not found then return 0; end if;

  -- Three reasons not to tell anybody about this machine, all of them cheap to
  -- check and all of them embarrassing to get wrong: it is deleted, it is not
  -- on the website, or it has no price. Messaging someone about a machine they
  -- cannot look at is worse than not messaging them.
  if v_item.deleted_at is not null then return 0; end if;
  if v_item.published_at is null then return 0; end if;
  if v_item.status<>'listed' or v_item.available_quantity<1 then return 0; end if;
  if coalesce(v_item.list_price_cents, 0) <= 0 then return 0; end if;

  v_doc_words := tsvector_to_array(
    to_tsvector('english'::regconfig, concat_ws(' ',
      v_item.title, v_item.brand, v_item.model,
      v_item.description, v_item.capacity, v_item.power))
  );

  select coalesce(array_agg(tag_id), '{}'::uuid[])
    into v_item_tags
  from public.item_tags where item_id = p_item_id;

  with base as (
    select
      l.id  as lead_id,
      li.id as interest_id,
      li.description,

      -- WhatsApp first where it is available: it is where this business already
      -- talks to its customers, and in the one-tap era it costs nothing.
      case
        when app.lead_is_reachable(l, 'whatsapp') then 'whatsapp'::public.outreach_channel
        when app.lead_is_reachable(l, 'email')    then 'email'::public.outreach_channel
      end as channel,

      case
        when li.subcategory_id is not null and li.subcategory_id = v_item.subcategory_id then 50
        when li.category_id is not null and li.category_id = v_item.category_id then 30
        else 0
      end as taxonomy_score,

      (select count(*)::int
         from public.lead_interest_tags lit
        where lit.interest_id = li.id and lit.tag_id = any(v_item_tags)) as shared_tags,

      (select count(*)::int
         from unnest(tsvector_to_array(li.search_vector)) as w
        where w = any(v_doc_words)) as shared_words,

      (select count(*)::int
         from public.lead_interests prev
         join public.items pi on pi.id = prev.item_id
        where prev.lead_id = l.id
          and prev.item_id is not null
          and pi.subcategory_id is not null
          and pi.subcategory_id = v_item.subcategory_id) as prior_looks

    from public.leads l
    join public.lead_interests li on li.lead_id = l.id and li.active
    where
      (app.lead_is_reachable(l, 'whatsapp') or app.lead_is_reachable(l, 'email'))

      -- Budget, with ten percent of grace. Somebody who said "under R20 000"
      -- will absolutely look at R21 500, and a hard ceiling silently loses real
      -- sales — which is the expensive kind of correctness.
      and (li.budget_max_cents is null
           or v_item.list_price_cents <= (li.budget_max_cents * 11) / 10)

      -- condition_grade is declared A, B, C, so BETTER SORTS EARLIER. "At least
      -- a B" therefore means the item's grade must be <= 'B'. It reads
      -- backwards; it is right.
      and (li.min_grade is null
           or (v_item.condition_grade is not null and v_item.condition_grade <= li.min_grade))

      -- Never pitch somebody the exact machine they already enquired about.
      and (li.item_id is null or li.item_id <> p_item_id)

      -- One pending suggestion per WANT. A delivery of six fryers still puts
      -- exactly one draft in front of staff for the person who wanted a fryer —
      -- which is what this guard has always been for — but a cold room arriving
      -- the same afternoon is a different want and gets its own draft.
      --
      -- The null branch is the compatibility case: a pending message nobody can
      -- attribute to a want still blocks the whole person, exactly as before.
      and not exists (
        select 1 from public.outreach_messages m
        where m.item_id is not null
          and m.state = 'queued'
          and (m.interest_id = li.id or (m.interest_id is null and m.lead_id = l.id)))

      -- The frequency cap, also per want. Seven days between messages about the
      -- same thing is the line between "they remembered what I wanted" and
      -- "unsubscribe"; seven days between messages about two different things
      -- is just a slow business. Newsletters carry no interest_id, so they still
      -- quiet the whole person for a week — which is the behaviour that was
      -- there before and is worth keeping.
      and not exists (
        select 1 from public.outreach_messages m
        where m.state = 'sent'
          and m.sent_at > now() - interval '7 days'
          and (m.interest_id = li.id or (m.interest_id is null and m.lead_id = l.id)))

      -- And the backstop, because "per want" is only as sane as the wants staff
      -- record. Somebody who has six interests on file is not getting six emails
      -- in a week no matter how well every one of them matches. Mirrored by
      -- OUTREACH_WEEKLY_CEILING in packages/core/src/leads.ts, which is what the
      -- ops app checks at the moment a human presses send.
      and (select count(*) from public.outreach_messages m
            where m.lead_id = l.id
              and m.state = 'sent'
              and m.sent_at > now() - interval '7 days') < 3
  ),

  ranked as (
    select
      b.*,
      b.taxonomy_score
        + b.shared_tags * 15
        -- Capped: forty shared stopwords is not four hundred points of signal.
        + least(b.shared_words * 8, 24)
        + case when b.prior_looks > 0 then 25 else 0 end
      as score
    from base b
    where b.channel is not null
  ),

  -- The floor. A bare category match scores 30 and must not clear it on its own,
  -- or every new fryer messages everybody who ever said the word "cooking".
  --
  -- DISTINCT ON is still per LEAD and not per interest, and that is deliberate:
  -- this function handles ONE machine, and one machine is one message. If two of
  -- somebody's wants both match this fryer, they hear about the fryer once, from
  -- whichever want fits it best. Two messages require two machines.
  best as (
    select distinct on (lead_id) *
    from ranked
    where score >= 40
    order by lead_id, score desc, interest_id
  )

  insert into public.outreach_messages
    (lead_id, interest_id, item_id, channel, reason, match_score)
  select
    b.lead_id,
    b.interest_id,
    p_item_id,
    b.channel,
    concat_ws(' · ',
      case
        when b.taxonomy_score = 50 then 'Wants exactly this type'
        when b.taxonomy_score = 30 then 'Wants this category'
      end,
      case when b.shared_tags > 0
        then b.shared_tags || ' matching ' ||
             case when b.shared_tags = 1 then 'feature' else 'features' end end,
      case when b.shared_words > 0 then 'their own words match this machine' end,
      case when b.prior_looks > 0 then 'looked at one like it before' end,
      case when b.description <> '' then '"' || left(b.description, 90) || '"' end
    ),
    b.score
  from best b
  -- Absorbs the repeat run, the concurrent run, and the machine this person has
  -- already been told about. See the outreach_once index.
  on conflict do nothing;

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$$;
