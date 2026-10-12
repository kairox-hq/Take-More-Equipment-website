-- Charges, payment history and public availability are updated in one transaction.
alter type public.payment_method add value if not exists 'cash';
alter type public.lead_source add value if not exists 'marketplace';
alter type public.lead_source add value if not exists 'social_media';
alter type public.lead_source add value if not exists 'google';
alter type public.lead_source add value if not exists 'website';

alter table public.orders
  add column installation_quote_cents bigint check (installation_quote_cents >= 0),
  add column installation_accepted boolean not null default false,
  add constraint orders_installation_is_finance check (
    not installation_accepted or (purchase_option='asset_finance' and installation_quote_cents is not null)
  );
alter table public.orders alter column charged_total_cents set expression as (
  coalesce(sold_total_cents,0)+delivery_fee_cents
  +case when installation_accepted then coalesce(installation_quote_cents,0) else 0 end
);
-- Convert previously recorded full payments to the same immutable ledger.
-- Missing historical references and actors are explicitly left unattributed.
alter table public.order_receipts alter column recorded_by drop not null;
insert into public.order_receipts(order_id,amount_cents,entry_kind,method,reference,received_on,recorded_at,recorded_by,request_id)
select o.id,o.charged_total_cents,'payment',o.payment_method,
  coalesce(nullif(btrim(o.payment_reference),''),'Historical full payment: '||o.code),
  (o.paid_at at time zone 'Africa/Johannesburg')::date,o.paid_at,o.sold_by,gen_random_uuid()
from public.orders o
where o.status in ('paid','void') and o.paid_at is not null and o.payment_method is not null and o.charged_total_cents>0
  and not exists(select 1 from public.order_receipts r where r.order_id=o.id);

create function app.order_received_cents(p_order_id uuid) returns bigint
language sql stable security definer set search_path='' as $$
  select coalesce(sum(case when entry_kind='payment' then amount_cents else -amount_cents end),0)::bigint
  from public.order_receipts where order_id=p_order_id
$$;
revoke all on function app.order_received_cents(uuid) from public,anon,authenticated;

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
         join public.items i on i.id = l.item_id
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

create or replace function app.guard_sale_plan() returns trigger language plpgsql security definer set search_path='' as $$
declare paid bigint;
begin
  if tg_op='DELETE' then
    if old.plan_confirmed_at is not null then raise exception 'Cancel this agreement instead of deleting its history.'; end if;
    return old;
  end if;
  if new.kind='hire' then
    if new.sale_plan is not null and (tg_op='INSERT' or old.kind='hire') then raise exception 'Sale terms do not apply to a hire.'; end if;
    new.sale_plan:=null;
  end if;
  if tg_op='UPDATE' and old.plan_confirmed_at is not null then
    if row(new.sale_plan,new.plan_start,new.plan_months,new.plan_payment_day,new.plan_deposit_cents,new.plan_final_due,new.plan_confirmed_at,new.sold_total_cents,new.lead_id,new.kind)
      is distinct from row(old.sale_plan,old.plan_start,old.plan_months,old.plan_payment_day,old.plan_deposit_cents,old.plan_final_due,old.plan_confirmed_at,old.sold_total_cents,old.lead_id,old.kind) then
      raise exception 'Confirmed terms are fixed. Cancel and create a new agreement to change them.';
    end if;
    if new.status='draft' and new.delivery_fee_cents is distinct from old.delivery_fee_cents then
      select coalesce(sum(case when entry_kind='payment' then amount_cents else -amount_cents end),0) into paid from public.order_receipts where order_id=new.id;
      if paid>0 and new.sold_total_cents+new.delivery_fee_cents+(case when new.installation_accepted then coalesce(new.installation_quote_cents,0) else 0 end)<=paid then
        raise exception 'The revised total must stay above money already received. Cancel and correct the agreement if a refund is needed.';
      end if;
    end if;
    if old.status='paid' and new.status='draft' then raise exception 'A paid payment plan cannot be reopened. Cancel it and retain the payment history.'; end if;
  end if;
  if new.status='paid' and (tg_op='INSERT' or old.status<>'paid') and new.payment_method::text='cash' then raise exception 'Choose a supported payment method.'; end if;
  if new.kind='sale' and new.status='paid' and (tg_op='INSERT' or old.status<>'paid') then
    if new.sale_plan is null then raise exception 'Choose the sale terms first.'; end if;
    if new.sale_plan<>'immediate' then
      select coalesce(sum(case when entry_kind='payment' then amount_cents else -amount_cents end),0) into paid from public.order_receipts where order_id=new.id;
      if new.plan_confirmed_at is null or paid<(new.sold_total_cents+new.delivery_fee_cents+case when new.installation_accepted then coalesce(new.installation_quote_cents,0) else 0 end) then
        raise exception 'Record the actual payments until the outstanding balance is zero.';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.save_sale_plan(p_order_id uuid,p_plan text,p_total bigint default null,p_start date default null,p_months integer default null,p_day integer default null,p_deposit bigint default null,p_due date default null)
returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; final_date date;
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.kind<>'sale' or o.status<>'draft' or o.plan_confirmed_at is not null then raise exception 'This sale cannot change its terms.'; end if;
  if p_plan not in ('immediate','layby','reservation','asset_finance') or p_plan is null then raise exception 'Choose the sale terms.'; end if;
  if p_plan='immediate' then
    update public.orders set sale_plan=p_plan,plan_start=null,plan_months=null,plan_payment_day=null,plan_deposit_cents=null,plan_final_due=null where id=p_order_id;
    return;
  end if;
  if o.lead_id is null or not exists(select 1 from public.order_lines where order_id=p_order_id) then raise exception 'Add a customer and items first.'; end if;
  perform app.refuse_unsellable_lines(p_order_id);
  if p_total is null or p_total<=0 or p_start is null or p_start>(now() at time zone 'Africa/Johannesburg')::date then raise exception 'Enter a positive agreed price and a start date no later than today.'; end if;
  if p_deposit is null or p_deposit<0 or p_deposit>=(p_total+o.delivery_fee_cents+case when o.installation_accepted then coalesce(o.installation_quote_cents,0) else 0 end) then raise exception 'The initial payment must be below the total. Use a normal sale for payment in full.'; end if;
  if p_plan='layby' then
    if p_months is null or p_months not in (2,3) or p_day is null or p_day not between 1 and 31 then raise exception 'Choose two or three months and a payment day.'; end if;
    final_date := (date_trunc('month',p_start)+make_interval(months=>p_months))::date;
    final_date := final_date + (least(p_day,extract(day from (final_date+interval '1 month - 1 day'))::integer)-1);
  elsif p_plan='reservation' then
    if p_deposit<>ceil(p_total/2.0) then raise exception 'A seven-day reservation requires a 50%% deposit.'; end if;
    final_date:=p_start+7;
  else
    if p_due is null or p_due<p_start then raise exception 'Enter the agreed final payment date.'; end if;
    final_date:=p_due;
  end if;
  update public.orders set sale_plan=p_plan,sold_total_cents=p_total,plan_start=p_start,
    plan_months=case when p_plan='layby' then p_months end,
    plan_payment_day=case when p_plan='layby' then p_day end,
    plan_deposit_cents=p_deposit,plan_final_due=final_date,plan_confirmed_at=now()
    where id=p_order_id;
end $$;

create function public.set_order_installation(
  p_order_id uuid,p_quote bigint default null,p_accepted boolean default false
) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; net bigint;
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status='void' then raise exception 'A cancelled or missing order cannot change installation.'; end if;
  if o.purchase_option is distinct from 'asset_finance' then raise exception 'Installation quotes apply to Rental Finance.'; end if;
  if p_accepted is null or p_quote<0 or (p_accepted and p_quote is null) then raise exception 'Enter a non-negative installation quote before accepting it.'; end if;
  update public.orders set installation_quote_cents=p_quote,installation_accepted=p_accepted
    where id=p_order_id returning * into o;
  net:=app.order_received_cents(p_order_id);
  if o.status='draft' and o.plan_confirmed_at is not null and net>=o.charged_total_cents then
    perform public.confirm_order_paid(p_order_id,o.sold_total_cents,
      (select method from public.order_receipts where order_id=p_order_id and entry_kind='payment' order by recorded_at desc,id desc limit 1),o.code);
  end if;
end $$;
revoke all on function public.set_order_installation(uuid,bigint,boolean) from public,anon;
grant execute on function public.set_order_installation(uuid,bigint,boolean) to authenticated;

create or replace function public.record_order_receipt(p_order_id uuid,p_amount bigint,p_method public.payment_method,p_reference text,p_date date,p_request_id uuid,p_refund boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; net bigint; result jsonb; previous public.order_receipts%rowtype;
begin
  if not app.is_staff() then raise exception 'Not permitted' using errcode='insufficient_privilege'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  select * into previous from public.order_receipts where request_id=p_request_id;
  if found then
    if previous.order_id<>p_order_id or previous.amount_cents<>p_amount or previous.method<>p_method or previous.reference<>btrim(p_reference) or previous.received_on<>p_date or (previous.entry_kind='refund')<>p_refund then raise exception 'This request was already used for a different payment.'; end if;
    return jsonb_build_object('code',o.code,'items','[]'::jsonb);
  end if;
  if o.plan_confirmed_at is null and o.status<>'paid' and not exists(select 1 from public.order_receipts where order_id=p_order_id) then raise exception 'Confirm the agreement or full payment first.'; end if;
  if p_refund is null or p_amount is null or p_amount<=0 or p_method is null or coalesce(btrim(p_reference),'')='' or p_request_id is null or p_date is null or p_date<coalesce(o.plan_start,(o.created_at at time zone 'Africa/Johannesburg')::date) or p_date>(now() at time zone 'Africa/Johannesburg')::date then raise exception 'Enter the actual amount, method, reference and payment date.'; end if;
  select coalesce(sum(case when entry_kind='payment' then amount_cents else -amount_cents end),0) into net from public.order_receipts where order_id=p_order_id;
  if p_refund then
    if p_method::text not in ('cash','card_machine','bank_transfer') then raise exception 'Choose Cash, Card machine or EFT for a refund.'; end if;
    if p_amount>(case when o.status='void' then net else greatest(net-o.charged_total_cents,0) end) then
      raise exception 'A refund cannot exceed the amount owed back to the customer.';
    end if;
  else
    if p_method::text not in ('card_machine','bank_transfer','payjustnow') then raise exception 'Choose a supported payment method.'; end if;
    if o.status not in ('draft','paid') or p_amount>o.charged_total_cents-net then raise exception 'This payment exceeds the outstanding balance or the order is closed.'; end if;
    if o.status='draft' then perform app.refuse_unsellable_lines(p_order_id); end if;
  end if;
  insert into public.order_receipts(order_id,amount_cents,entry_kind,method,reference,received_on,recorded_by,request_id)
    values(p_order_id,p_amount,case when p_refund then 'refund' else 'payment' end,p_method,btrim(p_reference),p_date,auth.uid(),p_request_id);
  if not p_refund and o.status='draft' and net+p_amount=o.charged_total_cents then
    if o.kind='hire' then result:=public.confirm_hire_paid(p_order_id,p_method,p_reference);
    else result:=public.confirm_order_paid(p_order_id,o.sold_total_cents,p_method,p_reference); end if;
  else
    result:=jsonb_build_object('code',o.code,'items','[]'::jsonb);
  end if;
  return result;
end $$;

-- Full counter payments also enter the ledger. Re-confirming a corrected
-- order records only the remaining money explicitly confirmed by staff.
create function app.record_full_order_payment() returns trigger
language plpgsql security definer set search_path='' as $$
declare remaining bigint;
begin
  if new.status='paid' and old.status<>'paid' and new.plan_confirmed_at is null then
    remaining:=new.charged_total_cents-app.order_received_cents(new.id);
    if remaining>0 then
      insert into public.order_receipts(order_id,amount_cents,entry_kind,method,reference,received_on,recorded_by,request_id)
      values(new.id,remaining,'payment',new.payment_method,coalesce(nullif(btrim(new.payment_reference),''),new.code),
        (new.paid_at at time zone 'Africa/Johannesburg')::date,auth.uid(),gen_random_uuid());
    end if;
  end if;
  return new;
end $$;
revoke all on function app.record_full_order_payment() from public,anon,authenticated;
create trigger orders_record_full_payment after update on public.orders for each row execute function app.record_full_order_payment();

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
          'code',        i.sku,
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
          'code',        i.sku,
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

alter table public.order_invoices
  add column received_cents bigint generated always as (coalesce((document->>'received_cents')::bigint,case when kind='invoice' then total_cents else 0 end)) stored,
  add column balance_cents bigint generated always as (coalesce((document->>'balance_cents')::bigint,case when kind='invoice' then 0 else total_cents end)) stored;

create function app.refresh_order_invoice(p_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare issuer jsonb; o public.orders%rowtype;
begin
  select * into o from public.orders where id=p_order_id;
  if not found or o.status='void' or o.lead_id is null or not exists(select 1 from public.order_lines where order_id=p_order_id)
    or (o.kind='hire' and app.hire_days(o.hire_start,o.hire_end) is null) then return; end if;
  select document->'issuer' into issuer from public.order_invoices where order_id=p_order_id order by issued_at desc,number desc limit 1;
  if issuer is not null then
    perform public.issue_invoice(p_order_id,case when o.status='paid' or app.order_received_cents(p_order_id)>0 then 'invoice' else 'proforma' end,issuer);
  end if;
end $$;
create function app.refresh_invoice_after_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if row(new.sold_total_cents,new.delivery_fee_cents,new.installation_quote_cents,new.installation_accepted,new.status,new.notes,new.hire_start,new.hire_end,new.lead_id)
    is distinct from row(old.sold_total_cents,old.delivery_fee_cents,old.installation_quote_cents,old.installation_accepted,old.status,old.notes,old.hire_start,old.hire_end,old.lead_id) then
    perform app.refresh_order_invoice(new.id);
  end if;
  return new;
end $$;
create function app.refresh_invoice_after_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform app.refresh_order_invoice(new.order_id); return new; end $$;
create function app.refresh_order_after_lines() returns trigger
language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
  oid:=case when tg_op='DELETE' then old.order_id else new.order_id end;
  update public.orders set updated_at=now() where id=oid;
  perform app.refresh_order_invoice(oid);
  if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function app.refresh_order_after_lines() from public,anon,authenticated;
create trigger lines_refresh_order after insert or delete or update of list_price_cents,item_id on public.order_lines
  for each row execute function app.refresh_order_after_lines();
revoke all on function app.refresh_order_invoice(uuid),app.refresh_invoice_after_order(),app.refresh_invoice_after_receipt() from public,anon,authenticated;
create trigger orders_refresh_invoice after update on public.orders for each row execute function app.refresh_invoice_after_order();
create trigger receipts_refresh_invoice after insert on public.order_receipts for each row execute function app.refresh_invoice_after_receipt();

-- Availability is a public label, calculated privately without exposing orders.
alter table public.items add column website_availability text not null default 'available'
  check (website_availability in ('available','reserved','on_hire','hidden'));
grant select(website_availability) on public.items to anon;
create function app.compute_website_availability() returns trigger
language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype;
begin
  select ord.* into o from public.order_lines l join public.orders ord on ord.id=l.order_id
  where l.item_id=new.id and ord.status in ('draft','paid')
    and not (ord.kind='hire' and ord.hire_returned_at is not null)
  order by ord.created_at desc limit 1;
  new.website_availability:=case
    when new.status not in ('listed','reserved') or new.deleted_at is not null then 'hidden'
    when o.purchase_option in ('layby','asset_finance') or o.sale_plan in ('layby','asset_finance') then 'hidden'
    when o.kind='hire' and o.status='paid' then 'on_hire'
    when new.status='reserved' or o.id is not null then 'reserved'
    else 'available' end;
  return new;
end $$;
revoke all on function app.compute_website_availability() from public,anon,authenticated;
create trigger items_compute_website_availability before insert or update on public.items for each row execute function app.compute_website_availability();

create or replace function app.enforce_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required public.app_role;
  actor    public.app_role;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select min_role into required
  from public.item_status_transitions
  where from_status = old.status
    and to_status   = new.status;

  if required is null then
    raise exception 'Cannot move an item from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  actor := app.staff_role();
  if actor is not null and actor < required then
    raise exception 'Moving an item from % to % requires the % role',
      old.status, new.status, required
      using errcode = 'insufficient_privilege';
  end if;

  if new.status in ('sold', 'handed_over') then
    new.sold_at := coalesce(new.sold_at, now());
  else
    new.sold_at          := null;
    new.sale_price_cents := null;
  end if;

  if new.status <> 'reserved' then
    new.reserved_until := null;
  end if;

  if new.status not in ('listed','reserved') then
    new.published_at := null;
  end if;

  return new;
end;
$$;

create or replace function app.enforce_publish_requirements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_count integer;
  publishing  boolean;
begin
  publishing := new.published_at is not null
                and (tg_op = 'INSERT' or old.published_at is null);

  if not publishing then
    return new;
  end if;

  if coalesce(length(btrim(new.title)), 0) < 3 or new.title = 'Untitled item' then
    raise exception 'An item needs a title before it can be published'
      using errcode = 'check_violation';
  end if;

  if new.category_id is null then
    raise exception 'An item needs a category before it can be published'
      using errcode = 'check_violation';
  end if;

  if new.condition_grade is null then
    raise exception 'An item needs a condition grade before it can be published'
      using errcode = 'check_violation';
  end if;

  if coalesce(new.list_price_cents, 0) <= 0 then
    raise exception 'An item needs an asking price before it can be published'
      using errcode = 'check_violation';
  end if;

  if coalesce(length(btrim(new.description)), 0) < 40 then
    raise exception 'An item needs a description of at least 40 characters before it can be published'
      using errcode = 'check_violation';
  end if;

  select count(*) into photo_count
  from public.item_media
  where item_id = new.id
    and kind = 'photo'
    and storage_path is not null
    and not is_placeholder;

  if photo_count = 0 then
    raise exception 'An item needs at least one photo of the actual machine before it can be published'
      using errcode = 'check_violation';
  end if;

  if new.status = 'refurbishing' then
    raise exception 'This machine is in the workshop. Move it to For sale once the repair is priced — until then the asking price is a guess.'
      using errcode = 'check_violation';
  end if;

  if new.status not in ('listed','reserved') then
    raise exception 'Only a listed or reserved item can appear on the website.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.add_order_line(
  p_order_id uuid,
  p_code     text default null,
  p_item_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
  v_code   text := app.normalise_item_code(p_code);
  v_item   public.items%rowtype;
  v_clash  text;
  v_next   integer;
begin
  if not app.is_staff() then
    raise exception 'Not permitted' using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'That order does not exist.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'draft' then
    raise exception 'This order is already %. Machines can only be added while it is open.', v_status
      using errcode = 'check_violation';
  end if;

  if p_item_id is not null then
    select * into v_item from public.items where id = p_item_id and deleted_at is null for update;
  elsif v_code is not null then
    select * into v_item from public.items where sku = v_code and deleted_at is null for update;
  else
    raise exception '% is not a machine code. They look like A042.', coalesce(nullif(btrim(p_code), ''), '(nothing)')
      using errcode = 'check_violation';
  end if;

  if not found then
    raise exception 'No machine has the code %.', coalesce(v_code, p_item_id::text)
      using errcode = 'no_data_found';
  end if;

  if v_item.status = 'sold' then
    raise exception '% has already been sold.', v_item.sku using errcode = 'check_violation';
  end if;

  select o.code into v_clash
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  where l.item_id = v_item.id
    and l.order_id <> p_order_id
    and o.status in ('draft', 'paid')
    and not (o.kind = 'hire' and o.hire_returned_at is not null)
  limit 1;

  if v_clash is not null then
    raise exception '% is already on order %.', v_item.sku, v_clash
      using errcode = 'unique_violation';
  end if;

  select coalesce(max(position), -1) + 1 into v_next
  from public.order_lines where order_id = p_order_id;

  insert into public.order_lines (
    order_id, item_id, list_price_cents, retail_price_cents, position,
    held_from_status
  ) values (
    p_order_id, v_item.id,
    coalesce(v_item.list_price_cents, 0),
    v_item.retail_price_cents,
    v_next,
    v_item.status
  );

  update public.items
     set status = 'reserved', published_at = v_item.published_at
   where id = v_item.id
     and status <> 'reserved';

  return jsonb_build_object(
    'item_id', v_item.id,
    'sku',     v_item.sku,
    'title',   v_item.title,
    'held_from_status', v_item.status
  );
end;
$$;

create function app.refresh_order_availability() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.items i set website_availability=i.website_availability
  where exists(select 1 from public.order_lines l where l.order_id=new.id and l.item_id=i.id);
  return new;
end $$;
revoke all on function app.refresh_order_availability() from public,anon,authenticated;
create trigger orders_refresh_availability after update of purchase_option,sale_plan,status,hire_returned_at on public.orders
  for each row execute function app.refresh_order_availability();

-- Hidden agreements are also denied through the base-table API and media.
alter policy "public reads published items" on public.items to anon
  using (published_at is not null and deleted_at is null and website_availability<>'hidden');

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
  i.website_availability as availability
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

revoke select(workshop_notes) on public.items from anon;

-- Recalculate existing labels. Re-publish complete listed items held on orders;
-- incomplete workshop items remain off the site and still pass the publish gate.
update public.items set website_availability=website_availability;
update public.items i set published_at=now()
where i.status='reserved' and i.published_at is null and i.deleted_at is null
  and i.category_id is not null and i.condition_grade is not null and i.list_price_cents>0
  and length(btrim(i.title))>=3 and i.title<>'Untitled item' and length(btrim(i.description))>=40
  and exists(select 1 from public.item_media m where m.item_id=i.id and m.kind='photo' and m.storage_path is not null and not m.is_placeholder)
  and exists(select 1 from public.order_lines l join public.orders o on o.id=l.order_id
    where l.item_id=i.id and l.held_from_status='listed' and o.status in ('draft','paid')
      and not(o.kind='hire' and o.hire_returned_at is not null));
