-- The checkout shows its "Discount code" box only while some code can be
-- used: a coupon switched on, started, not ended and not used up (counted
-- the same way live_coupon_boxes counts them). With none, the box is left
-- out instead of inviting people to guess.
--
-- any_live_coupon() answers yes or no and nothing else — no code, no count —
-- so it gives nothing away.

create or replace function public.any_live_coupon()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from coupons c
     where c.active
       and (c.starts_at is null or c.starts_at <= now())
       and (c.ends_at is null or c.ends_at > now())
       and (c.usage_limit is null or c.usage_limit > (
             select count(*) from orders o
              where o.coupon_code = c.code and o.status is distinct from 'cancelled'))
  )
$$;

revoke all on function public.any_live_coupon() from public;
grant execute on function public.any_live_coupon() to anon, authenticated;
