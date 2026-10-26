-- Fake orders: what checkout now checks, and what the admin controls
-- (Admin → Orders → Security).
--
--   1. The mobile number must be a Bangladeshi one (01 + 9 digits; +880 and
--      spaces are tidied away) — saved in that one shape.
--   2. Block list: a phone number or an internet connection (IP) on it
--      can't order; the try shows under Blocked order attempts.
--
-- A turned-away order (too many tries, or blocked) now comes back as a row
-- whose order_id is 'ERR:RATE_LIMITED' / 'ERR:BLOCKED' instead of an
-- error: an error undid the log line, so Blocked order attempts stayed empty.
--   3. Numbers whose parcels came back (refused / cancelled twice, or more
--      often than delivered) pay Tk 200 up front by bKash even in Dhaka —
--      a switch in the admin (on by default).

-- 01XXXXXXXXX, or null when it isn't a Bangladeshi mobile number.
create or replace function public.normalize_bd_phone(p text)
returns text
language plpgsql
immutable
as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '880%' then d := substr(d, 3); end if;   -- 8801… → 01…
  if length(d) = 10 and d like '1%' then d := '0' || d; end if;
  if d ~ '^01[3-9][0-9]{8}$' then return d; end if;
  return null;
end;
$$;

create table if not exists blocked_customers (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('phone', 'ip')),
  value       text not null,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (kind, value)
);
alter table blocked_customers enable row level security;
drop policy if exists "Admins manage the block list" on blocked_customers;
create policy "Admins manage the block list"
  on blocked_customers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Past orders on this number: refused or cancelled twice, or more often than
-- delivered — the same rule as the panel's "risk" (lib/admin.js riskLevel).
create or replace function public.number_is_risky(p_mobile text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with h as (
    select count(*) filter (where status in ('cancelled', 'returned')) as bad,
           count(*) filter (where status = 'delivered') as good
      from orders
     where public.normalize_bd_phone(mobile) = public.normalize_bd_phone(p_mobile)
  )
  select bad >= 2 or (bad >= 1 and bad > good) from h;
$$;
revoke all on function public.number_is_risky(text) from public;

-- Whether this number must pay up front: risky, and the admin's switch
-- (site_settings 'order_safety'.risky_advance) not turned off.
create or replace function public.needs_advance(p_mobile text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value ->> 'risky_advance')::boolean from site_settings where key = 'order_safety'), true)
     and public.number_is_risky(p_mobile);
$$;
revoke all on function public.needs_advance(text) from public;

-- Checkout asks this as the number is typed: is it valid, and does it pay
-- up front? (Blocked numbers aren't told so here — the order says it.)
create or replace function public.checkout_phone_check(p_mobile text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v text := public.normalize_bd_phone(p_mobile);
begin
  if v is null then return jsonb_build_object('valid', false, 'needs_advance', false); end if;
  return jsonb_build_object('valid', true, 'needs_advance', public.needs_advance(v));
end;
$$;
revoke all on function public.checkout_phone_check(text) from public;
grant execute on function public.checkout_phone_check(text) to anon, authenticated;

create or replace function public.create_order(
  p_full_name text,
  p_email text,
  p_mobile text,
  p_address text,
  p_district text,
  p_area text,
  p_notes text,
  p_items jsonb,
  p_payment_method text,
  p_bkash_transaction_id text default null,
  p_coupon_code text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
)
returns table(order_id text, invoice_number text, subtotal numeric, delivery_charge numeric, total numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item            jsonb;
  v_product         products%rowtype;
  v_quantity        numeric;
  v_price           numeric;
  v_computed_items  jsonb := '[]'::jsonb;
  v_subtotal        numeric := 0;
  v_discount        numeric := 0;
  v_coupon          text := nullif(upper(trim(coalesce(p_coupon_code, ''))), '');
  v_delivery_charge numeric;
  v_total           numeric;
  v_shipping_method text;
  v_order_id        text;
  v_invoice_number  text;
  v_payment_status  text;
  v_method          text := coalesce(nullif(trim(p_payment_method), ''), 'cod');
  v_advance         numeric := 0;
  v_mobile          text := public.normalize_bd_phone(p_mobile);
  v_ip              text := public.client_ip();
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  if not public.check_rate_limit('place_order', 10, 3600) then
    insert into blocked_attempts (action, ip, phone, email, name)
    values ('place_order', public.client_ip(), left(p_mobile, 30), left(p_email, 120), left(p_full_name, 100));
    -- Returned, not raised: a raise would undo the log line above.
    return query select 'ERR:RATE_LIMITED'::text, null::text, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  -- A Bangladeshi mobile number, saved in one shape (01XXXXXXXXX).
  if v_mobile is null then
    raise exception 'INVALID_PHONE';
  end if;

  -- Admin → Orders → Security → Block list: that number or connection
  -- can't order. Logged with the other turned-away attempts.
  if exists (
    select 1 from blocked_customers b
     where (b.kind = 'phone' and b.value = v_mobile)
        or (b.kind = 'ip' and v_ip is not null and b.value = v_ip)
  ) then
    insert into blocked_attempts (action, ip, phone, email, name)
    values ('blocked_customer', v_ip, v_mobile, left(p_email, 120), left(p_full_name, 100));
    return query select 'ERR:BLOCKED'::text, null::text, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  -- Re-price every line item from the real products table. The client's
  -- price is never read or trusted here.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    if not found then
      raise exception 'Invalid product in cart';
    end if;

    if v_product.publish_at is not null and v_product.publish_at > now() then
      raise exception 'UNAVAILABLE:%', v_product.name;
    end if;

    v_quantity := coalesce((v_item->>'quantity')::numeric, 0);
    if v_quantity <= 0 then
      raise exception 'Invalid quantity for %', v_product.name;
    end if;

    if (v_item->>'size') = any(coalesce(v_product.sizes_out, '{}'))
       or (v_product.size_stock ? (v_item->>'size')
           and coalesce((v_product.size_stock ->> (v_item->>'size'))::int, 0) < v_quantity) then
      raise exception 'SOLD_OUT:%:%', v_product.name, v_item->>'size';
    end if;

    v_price := public.sale_price(v_product.price, v_product.id::text, v_product.drop_name);
    v_subtotal := v_subtotal + (v_price * v_quantity);

    v_computed_items := v_computed_items || jsonb_build_object(
      'product_id', v_product.id,
      'name', v_product.name,
      'size', v_item->>'size',
      'quantity', v_quantity,
      'price', v_price,
      'image', coalesce(v_product.images[1], ''),
      'sku', coalesce(v_product.sku, '')
    );
  end loop;

  if v_coupon is not null then
    v_discount := public.coupon_discount(v_coupon, v_subtotal, p_mobile);
  end if;

  -- Shipping follows district: Dhaka Tk 80, everywhere else Tk 120.
  if p_district = 'Dhaka' then
    v_shipping_method := 'inside_dhaka';
    v_delivery_charge := 80;
  else
    v_shipping_method := 'outside_dhaka_advance';
    v_delivery_charge := 120;
  end if;

  v_total := v_subtotal - v_discount + v_delivery_charge;

  -- Payment. Dhaka: cash on delivery, or the whole order by bKash.
  -- Outside Dhaka: Tk 200 by bKash up front and the rest on delivery, or
  -- the whole order by bKash. Any bKash payment needs its Transaction ID.
  if v_method not in ('cod', 'bkash_advance', 'bkash_full') then
    raise exception 'PAYMENT_METHOD';
  end if;
  if v_method = 'cod' and p_district <> 'Dhaka' then
    v_method := 'bkash_advance'; -- outside Dhaka always pays something up front
  end if;
  -- A number whose parcels came back pays the advance in Dhaka too (when
  -- Admin → Orders → Security has it switched on).
  if v_method = 'cod' and public.needs_advance(v_mobile) then
    raise exception 'ADVANCE_REQUIRED';
  end if;
  if v_method <> 'cod' and nullif(trim(coalesce(p_bkash_transaction_id, '')), '') is null then
    raise exception 'TRX_REQUIRED';
  end if;
  v_advance := case v_method
    when 'bkash_full' then v_total
    when 'bkash_advance' then least(200, v_total)
    else 0
  end;
  v_payment_status := case
    when v_method = 'bkash_full' then 'paid'
    when v_method = 'bkash_advance' then 'advance_paid'
    else 'unpaid'
  end;

  v_order_id := 'SND-' || upper(to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'));
  -- To the millisecond: the old seconds-based number made a second order in
  -- the same second fail on the invoices' unique key.
  v_invoice_number := 'SND-' || to_char(clock_timestamp(), 'YYYY') || '-' ||
                       to_char(clock_timestamp(), 'MMDDHH24MISSMS');

  insert into orders (
    order_id, full_name, email, mobile, address, district, area, notes,
    items, subtotal, delivery_charge, total, advance_amount, payment_method, payment_status,
    bkash_transaction_id, shipping_method, invoice_number, status,
    coupon_code, discount_amount, utm_source, utm_medium, utm_campaign
  ) values (
    v_order_id, p_full_name, p_email, v_mobile, p_address, p_district, p_area, p_notes,
    v_computed_items, v_subtotal, v_delivery_charge, v_total, v_advance, v_method, v_payment_status,
    p_bkash_transaction_id, v_shipping_method, v_invoice_number, 'pending',
    case when v_discount > 0 then v_coupon end, v_discount,
    nullif(left(trim(coalesce(p_utm_source, '')), 100), ''),
    nullif(left(trim(coalesce(p_utm_medium, '')), 100), ''),
    nullif(left(trim(coalesce(p_utm_campaign, '')), 100), '')
  );

  insert into invoices (
    invoice_number, order_id, customer_name, customer_mobile, customer_address,
    items, subtotal, delivery_charge, total, issue_date, status
  ) values (
    v_invoice_number, v_order_id, p_full_name, v_mobile,
    p_address || ', ' || coalesce(p_area, '') || ', ' || p_district,
    v_computed_items, v_subtotal, v_delivery_charge, v_total, current_date, 'issued'
  );

  return query select v_order_id, v_invoice_number, v_subtotal, v_delivery_charge, v_total;
end;
$function$;

grant execute on function public.create_order(text, text, text, text, text, text, text, jsonb, text, text, text, text, text, text)
  to anon, authenticated;
