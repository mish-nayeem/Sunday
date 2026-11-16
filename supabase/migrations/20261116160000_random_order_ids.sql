-- Order numbers: SND- and 10 random digits (audit MEDIUM-3).
--
-- They were the time to the millisecond (SND-YYMMDDHHMMSSmmm), and the
-- admin's manual orders the time in hex. Two orders in the same
-- millisecond — possible during a drop — hit the unique key and the second
-- shopper got an error; and the numbers told anyone when every order was
-- placed. Now one function makes them, picks again if a number is taken,
-- and both create_order (the shop) and place_order (Admin → New order)
-- use it. Orders already placed keep their numbers; tracking, the portal
-- and the admin take either kind.

create or replace function public.new_order_id()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'SND-' || lpad(floor(random() * 10000000000)::bigint::text, 10, '0');
    exit when not exists (select 1 from orders o where o.order_id = candidate);
  end loop;
  return candidate;
end;
$$;

-- Only for the order functions below (they run as the owner).
revoke all on function public.new_order_id() from public, anon, authenticated;

-- create_order exactly as in 20261116150000_outside_dhaka_150.sql (the
-- newest), with only its order and invoice numbers changed.
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
    -- Locked until this order is in: a second checkout for the same piece
    -- waits here, then sees the stock this one took.
    select * into v_product from products where id = (v_item->>'product_id')::uuid for update;
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

  -- Shipping follows district: Dhaka Tk 80, everywhere else Tk 150.
  if p_district = 'Dhaka' then
    v_shipping_method := 'inside_dhaka';
    v_delivery_charge := 80;
  else
    v_shipping_method := 'outside_dhaka_advance';
    v_delivery_charge := 150;
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

  -- SND- and 10 random digits (public.new_order_id): two orders in the same
  -- moment can't collide, and the number says nothing about when or how
  -- many. The invoice carries the same digits, so it's unique too.
  v_order_id := public.new_order_id();
  v_invoice_number := 'SND-' || to_char(clock_timestamp(), 'YYYY') || '-' || substr(v_order_id, 5);

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

  -- The pieces leave the shelf now, not when the parcel is delivered — so
  -- the last one can't be sold twice.
  update orders o set stock_mode = 'at_order' where o.order_id = v_order_id;
  perform public.order_stock_move(v_order_id, -1);

  return query select v_order_id, v_invoice_number, v_subtotal, v_delivery_charge, v_total;
end;
$function$;

-- place_order exactly as in 20261023000200_payment_options.sql (the
-- newest), with only its order number changed. Same arguments, so who may
-- call it stays the same.
create or replace function public.place_order(payload jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o        jsonb := payload -> 'order';
  item     jsonb;
  p        products%rowtype;
  lines    jsonb := '[]'::jsonb;
  subtotal numeric := 0;
  qty      int;
  fee      numeric := greatest(coalesce((o ->> 'delivery_fee')::numeric, 0), 0);
  advance  numeric := greatest(coalesce((o ->> 'advance_amount')::numeric, 0), 0);
  new_id   text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  if jsonb_typeof(payload -> 'items') <> 'array' or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'EMPTY_CART';
  end if;

  for item in select * from jsonb_array_elements(payload -> 'items') loop
    qty := coalesce((item ->> 'qty')::int, 0);
    if qty <= 0 then
      raise exception 'INVALID_QTY:%', item ->> 'product_name';
    end if;
    select * into p from products where id::text = item ->> 'product_id';
    if not found then
      raise exception 'UNAVAILABLE:%', coalesce(item ->> 'product_name', 'A product');
    end if;
    if p.size_stock ? (item ->> 'size') and coalesce((p.size_stock ->> (item ->> 'size'))::int, 0) < qty then
      raise exception 'SOLD_OUT:%:%', p.name, item ->> 'size';
    end if;
    lines := lines || jsonb_build_object(
      'product_id', p.id, 'name', p.name, 'size', item ->> 'size',
      'quantity', qty, 'price', coalesce((item ->> 'price')::numeric, p.price)
    );
    subtotal := subtotal + qty * coalesce((item ->> 'price')::numeric, p.price);
  end loop;

  new_id := public.new_order_id();

  insert into orders (
    order_id, full_name, email, mobile, address, district, area, notes, admin_notes,
    items, subtotal, delivery_charge, total, advance_amount, payment_method, payment_status,
    bkash_transaction_id, shipping_method, status, utm_source, utm_medium
  ) values (
    new_id,
    trim(o ->> 'customer_name'),
    nullif(trim(coalesce(o ->> 'customer_email', '')), ''),
    trim(o ->> 'customer_phone'),
    trim(o ->> 'customer_address'),
    trim(coalesce(o ->> 'customer_area', '')),
    null,
    o ->> 'customer_note',
    'Manual entry from the admin panel',
    lines,
    subtotal,
    fee,
    subtotal + fee,
    least(advance, subtotal + fee),
    case when advance >= subtotal + fee and advance > 0 then 'bkash_full' when advance > 0 then 'bkash_advance' else 'cod' end,
    'unpaid',
    o ->> 'advance_trx_id',
    case when (o ->> 'delivery_zone') = 'inside' then 'inside_dhaka' else 'outside_dhaka_advance' end,
    'confirmed',
    o ->> 'utm_source',
    o ->> 'utm_medium'
  );

  return new_id;
end;
$$;
