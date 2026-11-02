-- Security fixes from the audit.
--
-- 1. Orders could be written straight into the table by anyone, with any
--    price, total or status. create_order (SECURITY DEFINER) is the only way
--    an order gets in now: it prices everything from the products table.
-- 2. track_order gave anyone a customer's whole order — name, phone,
--    address, notes, the admin's notes — from a phone number alone, or from
--    the order number alone (SND- + the time it was placed, easy to guess).
--    Now it needs both, they have to match, it returns only what the
--    tracking and confirmation pages show, and 30 looks an hour per address.
-- 3. A review could be posted as already approved, and reviews, contact
--    messages and newsletter sign-ups had no limit at all. Now: a review
--    always waits for the admin, and each is capped per address per hour.
-- 4. Helpers only meant to run inside create_order / check_coupon could be
--    called from the browser: coupon_discount (guess coupon codes with no
--    limit — check_coupon allows 20 an hour), check_rate_limit (adds a row
--    per call) and number_is_risky / needs_advance (a stranger's order
--    history from their phone number).
-- 5. create_order took 0.5 of a shirt at half price: quantities are whole
--    numbers from 1 to 20 now.
-- 6. send-order-confirmation could be asked to mail the same order (and its
--    invoice) again and again: orders.confirmation_sent_at, set once.

-- 1 ---------------------------------------------------------------------------
drop policy if exists "Anyone can place an order" on public.orders;

-- 2 ---------------------------------------------------------------------------
drop function if exists public.track_order(text, text);
create function public.track_order(p_order_id text, p_mobile text)
returns table (
  order_id text,
  status text,
  items jsonb,
  subtotal numeric,
  delivery_charge numeric,
  total numeric,
  advance_amount numeric,
  full_name text,
  mobile text,
  invoice_number text,
  tracking_note text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_rate_limit('track_order', 30, 3600) then
    raise exception 'RATE_LIMITED';
  end if;

  return query
    select o.order_id, o.status, o.items, o.subtotal, o.delivery_charge, o.total,
           o.advance_amount, o.full_name, o.mobile, o.invoice_number, o.tracking_note, o.created_at
      from orders o
     where o.order_id = upper(trim(coalesce(p_order_id, '')))
       and public.normalize_bd_phone(p_mobile) is not null
       and public.normalize_bd_phone(o.mobile) = public.normalize_bd_phone(p_mobile)
     limit 1;
end;
$$;
revoke all on function public.track_order(text, text) from public;
grant execute on function public.track_order(text, text) to anon, authenticated;

-- 3 ---------------------------------------------------------------------------
drop policy if exists "Anyone can submit a review" on public.reviews;
create policy "Anyone can submit a review"
  on public.reviews for insert
  to anon, authenticated
  with check (coalesce(is_approved, false) = false and public.rate_limit_ok('review', 3, 3600));
drop trigger if exists reviews_rate_limit_hit on public.reviews;
create trigger reviews_rate_limit_hit
  after insert on public.reviews
  for each row execute function public.record_rate_limit_hit('review', '3600');

drop policy if exists "Anyone can send a contact message" on public.contact_messages;
create policy "Anyone can send a contact message"
  on public.contact_messages for insert
  to anon, authenticated
  with check (public.rate_limit_ok('contact', 5, 3600));
drop trigger if exists contact_messages_rate_limit_hit on public.contact_messages;
create trigger contact_messages_rate_limit_hit
  after insert on public.contact_messages
  for each row execute function public.record_rate_limit_hit('contact', '3600');

drop policy if exists "Anyone can subscribe" on public.newsletter_subscribers;
create policy "Anyone can subscribe"
  on public.newsletter_subscribers for insert
  to anon, authenticated
  with check (public.rate_limit_ok('newsletter', 5, 3600));
drop trigger if exists newsletter_rate_limit_hit on public.newsletter_subscribers;
create trigger newsletter_rate_limit_hit
  after insert on public.newsletter_subscribers
  for each row execute function public.record_rate_limit_hit('newsletter', '3600');

-- 4 ---------------------------------------------------------------------------
revoke execute on function public.coupon_discount(text, numeric, text) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.number_is_risky(text) from public, anon, authenticated;
revoke execute on function public.needs_advance(text) from public, anon, authenticated;

-- 5 ---------------------------------------------------------------------------
-- create_order as it was (20261026000100_order_safety), with the quantity
-- check tightened.
CREATE OR REPLACE FUNCTION public.create_order(p_full_name text, p_email text, p_mobile text, p_address text, p_district text, p_area text, p_notes text, p_items jsonb, p_payment_method text, p_bkash_transaction_id text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text, p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text)
 RETURNS TABLE(order_id text, invoice_number text, subtotal numeric, delivery_charge numeric, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Whole pieces only, and no more than 20 of one line.
    if v_quantity <= 0 or v_quantity <> trunc(v_quantity) or v_quantity > 20 then
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

-- 6 ---------------------------------------------------------------------------
alter table public.orders add column if not exists confirmation_sent_at timestamptz;
-- Orders already placed have had their email (or never will): not again.
update public.orders set confirmation_sent_at = coalesce(created_at, now()) where confirmation_sent_at is null;
