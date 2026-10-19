-- ===========================================================================
-- Checkout: coupons, timed sales, link attribution, scheduled and sold-out
-- products, and a rate limit — create_order learns what the admin panel's
-- Marketing tools set up.
-- ===========================================================================
-- Same rules as before for everything else: prices come from the products
-- table, Dhaka is Tk 80 cash on delivery, everywhere else Tk 200 paid in
-- advance by bKash, stock is not touched until the order is delivered, and
-- an invoice is written with the order.
--
-- New, all optional (old calls keep working unchanged):
--   p_coupon_code   — checked with coupon_discount(); the discount comes off
--                     the items, never the delivery charge
--   p_utm_source / p_utm_medium / p_utm_campaign — the link they came from
--
-- Also new: a product scheduled for later (publish_at) can't be bought, a
-- size whose count can't cover the quantity is refused, each line is priced
-- at its running sale (sale_price()), and one IP can place at most 10
-- orders an hour (blocked tries are logged for Orders → Security). Invoice
-- numbers now run to the millisecond, so two orders in one second no longer
-- collide.
--
-- Tagged errors the checkout explains: SOLD_OUT:<name>:<size>,
-- UNAVAILABLE:<name>, RATE_LIMITED, COUPON_* (see coupon_discount).

begin;

-- The added parameters change the signature, so the old function is
-- replaced rather than overloaded (two candidates would make PostgREST's
-- named-argument call ambiguous).
drop function if exists public.create_order(text, text, text, text, text, text, text, jsonb, text, text);

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
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  if not public.check_rate_limit('place_order', 10, 3600) then
    insert into blocked_attempts (action, ip, phone, email, name)
    values ('place_order', public.client_ip(), left(p_mobile, 30), left(p_email, 120), left(p_full_name, 100));
    raise exception 'RATE_LIMITED';
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

  -- Shipping follows district.
  if p_district = 'Dhaka' then
    v_shipping_method := 'inside_dhaka';
    v_delivery_charge := 80;
  else
    v_shipping_method := 'outside_dhaka_advance';
    v_delivery_charge := 200;
  end if;

  v_total := v_subtotal - v_discount + v_delivery_charge;
  v_payment_status := case when p_payment_method = 'bkash_advance' then 'advance_paid' else 'unpaid' end;

  v_order_id := 'SND-' || upper(to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'));
  -- To the millisecond: the old seconds-based number made a second order in
  -- the same second fail on the invoices' unique key.
  v_invoice_number := 'SND-' || to_char(clock_timestamp(), 'YYYY') || '-' ||
                       to_char(clock_timestamp(), 'MMDDHH24MISSMS');

  insert into orders (
    order_id, full_name, email, mobile, address, district, area, notes,
    items, subtotal, delivery_charge, total, payment_method, payment_status,
    bkash_transaction_id, shipping_method, invoice_number, status,
    coupon_code, discount_amount, utm_source, utm_medium, utm_campaign
  ) values (
    v_order_id, p_full_name, p_email, p_mobile, p_address, p_district, p_area, p_notes,
    v_computed_items, v_subtotal, v_delivery_charge, v_total, p_payment_method, v_payment_status,
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
    v_invoice_number, v_order_id, p_full_name, p_mobile,
    p_address || ', ' || coalesce(p_area, '') || ', ' || p_district,
    v_computed_items, v_subtotal, v_delivery_charge, v_total, current_date, 'issued'
  );

  return query select v_order_id, v_invoice_number, v_subtotal, v_delivery_charge, v_total;
end;
$function$;

grant execute on function public.create_order(text, text, text, text, text, text, text, jsonb, text, text, text, text, text, text)
  to anon, authenticated;

commit;
