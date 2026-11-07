-- The coupon boxes on the shop (Admin → Website → Banners) show only codes
-- checkout will take right now.
--
-- live_coupon_boxes() answers for the codes that are in the boxes and
-- nothing else, so it can't be used to try out other codes: which of them
-- are switched on, started, not ended, and not used up (counted the same way
-- coupon_discount counts them).

create or replace function public.live_coupon_boxes()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct c.code), '{}')
    from site_settings s
    cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) b
    join coupons c on c.code = upper(btrim(b ->> 'code'))
   where s.key = 'promo_boxes'
     and coalesce((b ->> 'on')::boolean, false)
     and c.active
     and (c.starts_at is null or c.starts_at <= now())
     and (c.ends_at is null or c.ends_at > now())
     and (c.usage_limit is null or c.usage_limit > (
           select count(*) from orders o
            where o.coupon_code = c.code and o.status is distinct from 'cancelled'))
$$;

revoke all on function public.live_coupon_boxes() from public;
grant execute on function public.live_coupon_boxes() to anon, authenticated;
