-- Before physical units existed, a staff stage edit could move an item back
-- to For sale or the workshop while its draft still held it. Keep that stage
-- for cancellation, and keep the original payment eligibility: the order owns
-- the unit, and it has not been sold, retired or deleted in the meantime.
create or replace function app.refuse_unsellable_lines(p_order_id uuid) returns void
language plpgsql set search_path='' as $$
declare bad text;
begin
  perform 1 from public.items i where exists(select 1 from public.order_lines l where l.order_id=p_order_id and l.item_id=i.id) order by i.id for update;
  perform 1 from public.item_units u where exists(select 1 from public.order_lines l where l.order_id=p_order_id and l.item_unit_id=u.id) order by u.item_id,u.unit_number for update;
  select l.unit_code into bad from public.order_lines l join public.item_units u on u.id=l.item_unit_id join public.items i on i.id=l.item_id
    where l.order_id=p_order_id and (i.deleted_at is not null or u.retired_at is not null or u.current_order_line_id is distinct from l.id or u.status in ('sold','handed_over')) limit 1;
  if found then raise exception '% is no longer held by this order. Refresh and check the stock.',bad; end if;
end $$;
