-- A parcel the courier brought back (orders.status = 'returned') still
-- costs its delivery charge. return_fee_paid says whether the customer paid
-- it (or the bKash advance covered it): paid costs the shop nothing; unpaid
-- comes off revenue. Empty until the admin sets it on the order; until
-- then the panel counts it paid when the advance covered the charge.
alter table public.orders add column if not exists return_fee_paid boolean;

create or replace function public.admin_set_return_fee(p_order_id text, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  update orders set return_fee_paid = p_paid where order_id = p_order_id;
  if not found then
    raise exception 'That order no longer exists.';
  end if;
end;
$$;
revoke all on function public.admin_set_return_fee(text, boolean) from public, anon;
grant execute on function public.admin_set_return_fee(text, boolean) to authenticated;
