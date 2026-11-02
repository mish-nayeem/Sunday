


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."adjust_size_stock"("p_product_id" "text", "p_size" "text", "p_delta" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  cur    jsonb;
  next_n int;
begin
  select size_stock into cur from products where id::text = p_product_id for update;
  if cur is null or not (cur ? p_size) then
    return null;
  end if;
  next_n := coalesce((cur ->> p_size)::int, 0) + p_delta;
  if next_n < 0 then
    raise exception 'Not enough stock: only % left in size %.', coalesce((cur ->> p_size)::int, 0), p_size;
  end if;
  update products set size_stock = jsonb_set(size_stock, array[p_size], to_jsonb(next_n))
   where id::text = p_product_id;
  perform public.sunday_sync_stock_totals(p_product_id::uuid);
  return next_n;
end;
$$;


ALTER FUNCTION "public"."adjust_size_stock"("p_product_id" "text", "p_size" "text", "p_delta" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_analytics"("p_days" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  n          int := greatest(1, least(coalesce(p_days, 30), 365));
  since      timestamptz := now() - make_interval(days => n);
  prev_since timestamptz := now() - make_interval(days => n * 2);
  result     jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  with v as (
    select session_id, path, referrer, device, created_at
      from page_views where created_at >= since
  ),
  s as (
    select
      session_id,
      count(*) as views,
      bool_or(path like '/product/%') as saw_product,
      bool_or(path = '/cart') as saw_cart,
      bool_or(path = '/checkout') as saw_checkout,
      bool_or(path like '/order-confirmation%') as ordered,
      (array_agg(path order by created_at))[1] as entry,
      (array_agg(referrer order by created_at))[1] as ref,
      (array_agg(device order by created_at))[1] as dev
    from v group by session_id
  )
  select jsonb_build_object(
    'days', n,
    'visitors', (select count(*) from s),
    'views', (select count(*) from v),
    'bounced', (select count(*) from s where views = 1),
    'prev_visitors', (
      select count(distinct session_id) from page_views
       where created_at >= prev_since and created_at < since
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'visitors', vis, 'views', vw) order by d), '[]'::jsonb)
      from (
        select (created_at at time zone 'Asia/Dhaka')::date as d, count(distinct session_id) as vis, count(*) as vw
          from v group by 1
      ) x
    ),
    'hours', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'visitors', vis) order by h), '[]'::jsonb)
      from (
        select extract(hour from created_at at time zone 'Asia/Dhaka')::int as h, count(distinct session_id) as vis
          from v group by 1
      ) x
    ),
    'funnel', jsonb_build_object(
      'visited', (select count(*) from s),
      'product', (select count(*) from s where saw_product),
      'cart', (select count(*) from s where saw_cart),
      'checkout', (select count(*) from s where saw_checkout),
      'ordered', (select count(*) from s where ordered)
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object('id', pid, 'views', vw, 'visitors', vis) order by vw desc), '[]'::jsonb)
      from (
        select split_part(split_part(substr(path, 10), '?', 1), '/', 1) as pid,
               count(*) as vw, count(distinct session_id) as vis
          from v where path like '/product/%'
         group by 1 order by 2 desc limit 40
      ) x
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', src, 'visitors', c) order by c desc), '[]'::jsonb)
      from (
        select case
                 when ref is null or ref = '' then 'direct'
                 else regexp_replace(regexp_replace(lower(ref), '^[a-z]+://(www\.|m\.|l\.|lm\.|mobile\.)?', ''), '[/:?#].*$', '')
               end as src,
               count(*) as c
          from s group by 1 order by 2 desc limit 20
      ) x
    ),
    'devices', (
      select coalesce(jsonb_object_agg(coalesce(dev, 'unknown'), c), '{}'::jsonb)
      from (select dev, count(*) as c from s group by 1) x
    ),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', c)), '[]'::jsonb)
      from (select path, count(*) as c from v group by 1 order by 2 desc limit 300) x
    ),
    'entries', (
      select coalesce(jsonb_agg(jsonb_build_object('path', entry, 'entries', c, 'bounces', b)), '[]'::jsonb)
      from (select entry, count(*) as c, count(*) filter (where views = 1) as b from s group by 1) x
    )
  ) into result;

  return result;
end;
$_$;


ALTER FUNCTION "public"."admin_analytics"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_process_return"("p_return_id" bigint, "p_action" "text", "p_items" "jsonb", "p_refund" numeric, "p_note" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ret       order_returns%rowtype;
  x         jsonb;
  l         record;
  q         int;
  done      jsonb := '[]'::jsonb;
  left_from int;
  left_to   int;
  refund    numeric := greatest(coalesce(p_refund, 0), 0);
  result    jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into ret from order_returns where id = p_return_id for update;
  if not found then
    raise exception 'That request no longer exists.';
  end if;
  if ret.status not in ('open', 'approved') then
    raise exception 'This request has already been %.', ret.status;
  end if;

  if p_action = 'reject' then
    update order_returns
       set status = 'rejected', admin_note = nullif(trim(coalesce(p_note, '')), ''),
           resolution = jsonb_build_object('action', 'reject', 'at', now()),
           processed_at = now(), resolved_at = now(), seen_at = coalesce(seen_at, now())
     where id = p_return_id;
    return jsonb_build_object('action', 'reject');
  end if;

  if p_action not in ('exchange', 'refund') then
    raise exception 'Choose exchange, refund or reject.';
  end if;

  perform 1 from orders where order_id = ret.order_id for update;

  for x in select * from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
  loop
    select * into l from order_lines
     where order_id = ret.order_id and line = (x ->> 'item_id')::int;
    if not found then
      raise exception 'A piece in this request isn''t on order %.', ret.order_id;
    end if;

    q := least(greatest(coalesce((x ->> 'qty')::int, 0), 0), l.qty - l.returned_qty);
    if q = 0 then
      continue;
    end if;

    if p_action = 'exchange' then
      if coalesce(trim(x ->> 'to_size'), '') = '' then
        raise exception 'Pick the new size for %.', l.product_name;
      end if;
      if trim(x ->> 'to_size') = l.size then
        raise exception 'The new size for % is the same as the old one.', l.product_name;
      end if;
      left_to := public.adjust_size_stock(l.product_id, trim(x ->> 'to_size'), -q);
      left_from := public.adjust_size_stock(l.product_id, l.size, q);
      done := done || jsonb_build_object(
        'item_id', l.line, 'product_id', l.product_id, 'product_name', l.product_name,
        'qty', q, 'from_size', l.size, 'to_size', trim(x ->> 'to_size'),
        'from_left', left_from, 'to_left', left_to);
    else
      left_from := public.adjust_size_stock(l.product_id, l.size, q);
      update orders
         set items = jsonb_set(items, array[l.line::text, 'returned_qty'], to_jsonb(l.returned_qty + q))
       where order_id = ret.order_id;
      done := done || jsonb_build_object(
        'item_id', l.line, 'product_id', l.product_id, 'product_name', l.product_name,
        'qty', q, 'size', l.size, 'price', l.price, 'left', left_from);
    end if;
  end loop;

  if jsonb_array_length(done) = 0 then
    raise exception 'Pick at least one piece.';
  end if;

  if p_action = 'refund' and refund > 0 then
    update orders set refunded_amount = refunded_amount + refund where order_id = ret.order_id;
  end if;

  result := jsonb_build_object('action', p_action, 'at', now(), 'items', done,
                               'refund', case when p_action = 'refund' then refund else 0 end);

  update order_returns
     set status = 'resolved', kind = p_action, resolution = result,
         admin_note = nullif(trim(coalesce(p_note, '')), ''),
         processed_at = now(), resolved_at = now(), seen_at = coalesce(seen_at, now())
   where id = p_return_id;

  return result;
end;
$$;


ALTER FUNCTION "public"."admin_process_return"("p_return_id" bigint, "p_action" "text", "p_items" "jsonb", "p_refund" numeric, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_coupon"("p_code" "text", "p_subtotal" numeric, "p_phone" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  d numeric;
begin
  if not public.check_rate_limit('coupon_check', 20, 3600) then
    raise exception 'RATE_LIMITED';
  end if;
  d := public.coupon_discount(p_code, p_subtotal, p_phone);
  return jsonb_build_object('code', upper(trim(p_code)), 'discount', d);
end;
$$;


ALTER FUNCTION "public"."check_coupon"("p_code" "text", "p_subtotal" numeric, "p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("action" "text", "max_count" integer, "window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ip         text := public.client_ip();
  bucket_key text;
  hits       int;
begin
  if ip is null then
    return true;
  end if;
  bucket_key := action || ':' || ip;
  delete from rate_limit_hits
   where bucket = bucket_key and created_at < now() - (window_seconds || ' seconds')::interval;
  select count(*) into hits from rate_limit_hits where bucket = bucket_key;
  if hits >= max_count then
    return false;
  end if;
  insert into rate_limit_hits (bucket) values (bucket_key);
  return true;
end;
$$;


ALTER FUNCTION "public"."check_rate_limit"("action" "text", "max_count" integer, "window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."checkout_phone_check"("p_mobile" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v text := public.normalize_bd_phone(p_mobile);
begin
  if v is null then return jsonb_build_object('valid', false, 'needs_advance', false); end if;
  return jsonb_build_object('valid', true, 'needs_advance', public.needs_advance(v));
end;
$$;


ALTER FUNCTION "public"."checkout_phone_check"("p_mobile" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."client_ip"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  raw   text;
  parts text[];
begin
  raw := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
  if raw is null or trim(raw) = '' then
    return null;
  end if;
  parts := string_to_array(raw, ',');
  return trim(parts[array_length(parts, 1)]);
end;
$$;


ALTER FUNCTION "public"."client_ip"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."coupon_discount"("p_code" "text", "p_subtotal" numeric, "p_phone" "text") RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c     coupons%rowtype;
  used  int;
  phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  d     numeric;
begin
  select * into c from coupons where code = upper(trim(p_code));
  if not found or not c.active then
    raise exception 'COUPON_INVALID';
  end if;
  if c.starts_at is not null and now() < c.starts_at then
    raise exception 'COUPON_NOT_STARTED';
  end if;
  if c.ends_at is not null and now() > c.ends_at then
    raise exception 'COUPON_EXPIRED';
  end if;
  if p_subtotal < c.min_subtotal then
    raise exception 'COUPON_MIN:%', c.min_subtotal;
  end if;
  if c.usage_limit is not null then
    select count(*) into used from orders
     where coupon_code = c.code and status is distinct from 'cancelled';
    if used >= c.usage_limit then
      raise exception 'COUPON_USED_UP';
    end if;
  end if;
  if c.per_customer_limit is not null and phone <> '' then
    select count(*) into used from orders
     where coupon_code = c.code and status is distinct from 'cancelled'
       and right(regexp_replace(mobile, '\D', '', 'g'), 9) = phone;
    if used >= c.per_customer_limit then
      raise exception 'COUPON_ALREADY_USED';
    end if;
  end if;
  if c.kind = 'percent' then
    d := round(p_subtotal * c.value / 100);
    if c.max_discount is not null then
      d := least(d, c.max_discount);
    end if;
  else
    d := c.value;
  end if;
  return least(d, p_subtotal);
end;
$$;


ALTER FUNCTION "public"."coupon_discount"("p_code" "text", "p_subtotal" numeric, "p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order"("p_full_name" "text", "p_email" "text", "p_mobile" "text", "p_address" "text", "p_district" "text", "p_area" "text", "p_notes" "text", "p_items" "jsonb", "p_payment_method" "text", "p_bkash_transaction_id" "text" DEFAULT NULL::"text", "p_coupon_code" "text" DEFAULT NULL::"text", "p_utm_source" "text" DEFAULT NULL::"text", "p_utm_medium" "text" DEFAULT NULL::"text", "p_utm_campaign" "text" DEFAULT NULL::"text") RETURNS TABLE("order_id" "text", "invoice_number" "text", "subtotal" numeric, "delivery_charge" numeric, "total" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- The pieces leave the shelf now, not when the parcel is delivered — so
  -- the last one can't be sold twice.
  update orders o set stock_mode = 'at_order' where o.order_id = v_order_id;
  perform public.order_stock_move(v_order_id, -1);

  return query select v_order_id, v_invoice_number, v_subtotal, v_delivery_charge, v_total;
end;
$$;


ALTER FUNCTION "public"."create_order"("p_full_name" "text", "p_email" "text", "p_mobile" "text", "p_address" "text", "p_district" "text", "p_area" "text", "p_notes" "text", "p_items" "jsonb", "p_payment_method" "text", "p_bkash_transaction_id" "text", "p_coupon_code" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(lower(auth.jwt() ->> 'email') = 'sundayclothin@gmail.com', false)
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_cart_converted"("p_session_id" "text", "p_order_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update abandoned_carts
     set converted_order_id = p_order_id
   where session_id = p_session_id
     and converted_order_id is null
     and exists (select 1 from orders where order_id = p_order_id);
end;
$$;


ALTER FUNCTION "public"."mark_cart_converted"("p_session_id" "text", "p_order_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."needs_advance"("p_mobile" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select (value ->> 'risky_advance')::boolean from site_settings where key = 'order_safety'), true)
     and public.number_is_risky(p_mobile);
$$;


ALTER FUNCTION "public"."needs_advance"("p_mobile" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_bd_phone"("p" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '880%' then d := substr(d, 3); end if;   -- 8801… → 01…
  if length(d) = 10 and d like '1%' then d := '0' || d; end if;
  if d ~ '^01[3-9][0-9]{8}$' then return d; end if;
  return null;
end;
$_$;


ALTER FUNCTION "public"."normalize_bd_phone"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  begin
    perform net.http_post(
      url := 'https://qgvadxivqtlgobfzbdxt.supabase.co/functions/v1/notify',
      body := jsonb_build_object('action', 'order', 'order_id', new.order_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_new_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."number_is_risky"("p_mobile" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with h as (
    select count(*) filter (where status in ('cancelled', 'returned')) as bad,
           count(*) filter (where status = 'delivered') as good
      from orders
     where public.normalize_bd_phone(mobile) = public.normalize_bd_phone(p_mobile)
  )
  select bad >= 2 or (bad >= 1 and bad > good) from h;
$$;


ALTER FUNCTION "public"."number_is_risky"("p_mobile" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."order_stock_move"("p_order_id" "text", "p_sign" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  l record;
begin
  for l in select product_id, size, qty - returned_qty as qty from order_lines where order_id = p_order_id loop
    if l.qty > 0 and l.product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      update products
         set size_stock = case
               when size_stock ? l.size
                 then jsonb_set(size_stock, array[l.size], to_jsonb(greatest(0, coalesce((size_stock ->> l.size)::int, 0) + p_sign * l.qty)))
               else size_stock end,
             quantity = case when size_stock ? l.size then quantity else greatest(0, coalesce(quantity, 0) + p_sign * l.qty) end
       where id::text = l.product_id;
      perform public.sunday_sync_stock_totals(l.product_id::uuid);
    end if;
  end loop;
  update orders set stock_taken = (p_sign < 0) where order_id = p_order_id;
end;
$_$;


ALTER FUNCTION "public"."order_stock_move"("p_order_id" "text", "p_sign" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_order"("payload" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  new_id := 'SND-' || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint));

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


ALTER FUNCTION "public"."place_order"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rate_limit_ok"("action" "text", "max_count" integer, "window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ip   text := public.client_ip();
  hits int;
begin
  if ip is null then
    return true;
  end if;
  select count(*) into hits from rate_limit_hits
   where bucket = action || ':' || ip
     and created_at > now() - (window_seconds || ' seconds')::interval;
  return hits < max_count;
end;
$$;


ALTER FUNCTION "public"."rate_limit_ok"("action" "text", "max_count" integer, "window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_rate_limit_hit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ip             text := public.client_ip();
  action         text := TG_ARGV[0];
  window_seconds int  := TG_ARGV[1]::int;
  bucket_key     text;
begin
  if ip is not null then
    bucket_key := action || ':' || ip;
    delete from rate_limit_hits
     where bucket = bucket_key and created_at < now() - (window_seconds || ' seconds')::interval;
    insert into rate_limit_hits (bucket) values (bucket_key);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."record_rate_limit_hit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_products"("ids" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  update products p
     set shop_position = x.ord
    from unnest(ids) with ordinality as x(id, ord)
   where p.id::text = x.id;
end;
$$;


ALTER FUNCTION "public"."reorder_products"("ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sale_price"("p_price" numeric, "p_product_id" "text", "p_drop" "text") RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  pct int;
begin
  select max(s.percent) into pct
    from sales s
   where s.active and s.starts_at <= now() and s.ends_at > now()
     and (
       (s.drop_name is null and coalesce(cardinality(s.product_ids), 0) = 0)
       or (s.drop_name is not null and s.drop_name = p_drop)
       or p_product_id = any(s.product_ids)
     );
  if pct is null then
    return p_price;
  end if;
  return round(p_price * (100 - pct) / 100);
end;
$$;


ALTER FUNCTION "public"."sale_price"("p_price" numeric, "p_product_id" "text", "p_drop" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_abandoned_cart"("p_session_id" "text", "p_name" "text", "p_phone" "text", "p_items" "jsonb", "p_cart_value" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
begin
  if p_session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'BAD_SESSION';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'BAD_ITEMS';
  end if;
  if not exists (select 1 from abandoned_carts where session_id = p_session_id)
     and not public.check_rate_limit('abandoned_cart', 20, 3600) then
    raise exception 'RATE_LIMITED';
  end if;
  insert into abandoned_carts (session_id, customer_name, customer_phone, items, cart_value, last_active)
  values (p_session_id, nullif(left(trim(p_name), 100), ''), nullif(left(trim(p_phone), 30), ''),
          p_items, greatest(coalesce(p_cart_value, 0), 0), now())
  on conflict (session_id) do update
     set customer_name = excluded.customer_name, customer_phone = excluded.customer_phone,
         items = excluded.items, cart_value = excluded.cart_value, last_active = now()
   where abandoned_carts.converted_order_id is null;
end;
$_$;


ALTER FUNCTION "public"."save_abandoned_cart"("p_session_id" "text", "p_name" "text", "p_phone" "text", "p_items" "jsonb", "p_cart_value" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sunday_profile_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.role := case when lower(coalesce(new.email, '')) = 'sundayclothin@gmail.com' then 'admin' else 'user' end;
  return new;
end;
$$;


ALTER FUNCTION "public"."sunday_profile_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sunday_sync_stock_totals"("p_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  total int;
begin
  select coalesce(sum(greatest(coalesce(
           case when (e.v #>> '{}') ~ '^-?\d+$' then (e.v #>> '{}')::int end, 0), 0)), 0)
    into total
    from products p, jsonb_each(coalesce(p.size_stock, '{}'::jsonb)) as e(k, v)
   where p.id = p_product_id;

  update products
     set quantity = total,
         stock_status = case when total = 0 then 'out_of_stock' when total <= 3 then 'low_stock' else 'in_stock' end,
         updated_at = now()
   where id = p_product_id
     and size_stock is not null and size_stock <> '{}'::jsonb;
end;
$_$;


ALTER FUNCTION "public"."sunday_sync_stock_totals"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."support_find_order"("p_order_id" "text", "p_contact" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id  text := public.support_match_order(p_order_id, p_contact);
  v_out jsonb;
begin
  if v_id is null then
    return null;
  end if;
  select jsonb_build_object(
    'id', o.order_id,
    'status', o.status,
    'placed_at', o.created_at,
    'first_name', split_part(trim(o.full_name), ' ', 1),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('product_name', l.product_name, 'size', l.size, 'qty', l.qty, 'price', l.price) order by l.line)
        from order_lines l where l.order_id = o.order_id
    ), '[]'::jsonb),
    'open_request', (
      select jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'created_at', r.created_at)
        from order_returns r
       where r.order_id = o.order_id and r.status in ('open', 'approved')
       order by r.created_at desc limit 1
    )
  ) into v_out
  from orders o where o.order_id = v_id;
  return v_out;
end;
$$;


ALTER FUNCTION "public"."support_find_order"("p_order_id" "text", "p_contact" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."support_match_order"("p_order_id" "text", "p_contact" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_contact text := lower(trim(coalesce(p_contact, '')));
  v_digits  text := right(regexp_replace(v_contact, '\D', '', 'g'), 9);
  v_id      text;
begin
  if length(v_contact) < 5 or coalesce(trim(p_order_id), '') = '' then
    return null;
  end if;
  select o.order_id into v_id
    from orders o
   where upper(o.order_id) = upper(trim(p_order_id))
     and (
       (position('@' in v_contact) > 0 and lower(trim(coalesce(o.email, ''))) = v_contact)
       or (position('@' in v_contact) = 0 and length(v_digits) = 9
           and right(regexp_replace(o.mobile, '\D', '', 'g'), 9) = v_digits)
     );
  return v_id;
end;
$$;


ALTER FUNCTION "public"."support_match_order"("p_order_id" "text", "p_contact" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."support_request_return"("p_order_id" "text", "p_contact" "text", "p_kind" "text", "p_reason" "text", "p_items" "jsonb", "p_details" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id     text := public.support_match_order(p_order_id, p_contact);
  v_status text;
  v_items  jsonb;
  v_new    bigint;
begin
  if v_id is null then
    raise exception 'We couldn''t find an order with those details.';
  end if;
  if p_kind not in ('refund', 'exchange') then
    raise exception 'Choose refund or exchange.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Tell us the reason.';
  end if;
  select status into v_status from orders where order_id = v_id;
  if v_status is distinct from 'delivered' then
    raise exception 'Requests open once the order has been delivered.';
  end if;
  if exists (select 1 from order_returns where order_id = v_id and status in ('open', 'approved')) then
    raise exception 'There is already an open request for this order — we''ll be in touch.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'product_name', l.product_name,
      'size', l.size,
      'qty', least(greatest(coalesce((x ->> 'qty')::int, 1), 1), l.qty),
      'exchange_size', nullif(left(trim(coalesce(x ->> 'exchange_size', '')), 20), '')
    )), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x
  join lateral (
    select * from order_lines ol
     where ol.order_id = v_id and ol.product_name = x ->> 'product_name' and ol.size = x ->> 'size'
     limit 1
  ) l on true;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Pick at least one item.';
  end if;

  insert into order_returns (order_id, reason, kind, source, items, details, contact)
  values (v_id, left(trim(p_reason), 200), p_kind, 'customer', v_items,
          nullif(left(trim(coalesce(p_details, '')), 1000), ''), left(trim(p_contact), 120))
  returning id into v_new;
  return jsonb_build_object('id', v_new);
end;
$$;


ALTER FUNCTION "public"."support_request_return"("p_order_id" "text", "p_contact" "text", "p_kind" "text", "p_reason" "text", "p_items" "jsonb", "p_details" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_order"("p_order_id" "text", "p_mobile" "text") RETURNS TABLE("order_id" "text", "status" "text", "items" "jsonb", "subtotal" numeric, "delivery_charge" numeric, "total" numeric, "advance_amount" numeric, "full_name" "text", "mobile" "text", "invoice_number" "text", "tracking_note" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."track_order"("p_order_id" "text", "p_mobile" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_order_status"("p_order_id" "text", "p_new_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  o       orders%rowtype;
  off     boolean := p_new_status in ('cancelled', 'returned');
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into o from orders where order_id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if off then
    -- Not going out: its pieces go back.
    if o.stock_taken then perform public.order_stock_move(p_order_id, 1); end if;
  elsif o.stock_mode = 'at_order' then
    -- A live order holds its pieces, whatever step it's at.
    if not o.stock_taken then perform public.order_stock_move(p_order_id, -1); end if;
  else
    -- The old rule: taken when delivered, back when it isn't any more.
    if p_new_status = 'delivered' and not o.stock_taken then
      perform public.order_stock_move(p_order_id, -1);
    elsif p_new_status <> 'delivered' and o.stock_taken then
      perform public.order_stock_move(p_order_id, 1);
    end if;
  end if;

  update orders set status = p_new_status, updated_at = now() where order_id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."update_order_status"("p_order_id" "text", "p_new_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_advance"("p_trx" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  clean text := upper(regexp_replace(
    regexp_replace(coalesce(p_trx, ''), '^\s*trx\s*id\s*[:.#-]?\s*', '', 'i'),
    '[^A-Za-z0-9]', '', 'g'));
  o orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  select * into o from orders
   where upper(bkash_transaction_id) = clean and payment_method in ('bkash_advance', 'bkash_full')
   for update;
  if not found or clean = '' then
    raise exception 'TRX_NOT_FOUND';
  end if;
  if o.advance_verified_at is not null then
    raise exception 'ALREADY_VERIFIED:%', o.order_id;
  end if;
  if o.status = 'cancelled' then
    raise exception 'ORDER_CANCELLED:%', o.order_id;
  end if;
  update orders set advance_verified_at = now() where id = o.id;
  return o.order_id;
end;
$$;


ALTER FUNCTION "public"."verify_advance"("p_trx" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."abandoned_carts" (
    "session_id" "text" NOT NULL,
    "customer_name" "text",
    "customer_phone" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cart_value" numeric DEFAULT 0 NOT NULL,
    "last_active" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "converted_order_id" "text"
);


ALTER TABLE "public"."abandoned_carts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."about_blocks" (
    "id" bigint NOT NULL,
    "image_url" "text" NOT NULL,
    "heading" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."about_blocks" OWNER TO "postgres";


ALTER TABLE "public"."about_blocks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."about_blocks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ad_spend" (
    "id" bigint NOT NULL,
    "channel" "text" NOT NULL,
    "spend" numeric DEFAULT 0 NOT NULL,
    "revenue" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ad_spend" OWNER TO "postgres";


ALTER TABLE "public"."ad_spend" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ad_spend_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."admin_notice_state" (
    "key" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_notice_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocked_attempts" (
    "id" bigint NOT NULL,
    "action" "text" NOT NULL,
    "ip" "text",
    "phone" "text",
    "email" "text",
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."blocked_attempts" OWNER TO "postgres";


ALTER TABLE "public"."blocked_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."blocked_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."blocked_customers" (
    "id" bigint NOT NULL,
    "kind" "text" NOT NULL,
    "value" "text" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "blocked_customers_kind_check" CHECK (("kind" = ANY (ARRAY['phone'::"text", 'ip'::"text"])))
);


ALTER TABLE "public"."blocked_customers" OWNER TO "postgres";


ALTER TABLE "public"."blocked_customers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."blocked_customers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "subject" "text",
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contact_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "code" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "value" numeric NOT NULL,
    "min_subtotal" numeric DEFAULT 0 NOT NULL,
    "max_discount" numeric,
    "usage_limit" integer,
    "per_customer_limit" integer DEFAULT 1,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "coupons_code_check" CHECK (("code" ~ '^[A-Z0-9_-]{3,24}$'::"text")),
    CONSTRAINT "coupons_kind_check" CHECK (("kind" = ANY (ARRAY['percent'::"text", 'fixed'::"text"]))),
    CONSTRAINT "coupons_percent_range" CHECK ((("kind" <> 'percent'::"text") OR ("value" <= (100)::numeric))),
    CONSTRAINT "coupons_value_check" CHECK (("value" > (0)::numeric))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drop_costs" (
    "id" bigint NOT NULL,
    "drop_name" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "label" "text",
    "amount" numeric NOT NULL,
    "spent_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "drop_costs_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "drop_costs_kind_check" CHECK (("kind" = ANY (ARRAY['ads'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."drop_costs" OWNER TO "postgres";


ALTER TABLE "public"."drop_costs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."drop_costs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."email_campaigns" (
    "id" bigint NOT NULL,
    "campaign" "text" NOT NULL,
    "open_rate" numeric DEFAULT 0 NOT NULL,
    "click_rate" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "brevo_id" bigint,
    "subject" "text",
    "audience" "text",
    "recipients" integer,
    "status" "text",
    "sent_at" timestamp with time zone,
    "delivered" integer,
    "opens" integer,
    "clicks" integer,
    "unsubscribes" integer,
    "stats_at" timestamp with time zone
);


ALTER TABLE "public"."email_campaigns" OWNER TO "postgres";


ALTER TABLE "public"."email_campaigns" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."email_campaigns_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "expenses_category_check" CHECK (("category" = ANY (ARRAY['inventory'::"text", 'marketing'::"text", 'operations'::"text", 'shipping'::"text", 'utilities'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hero_slides" (
    "id" bigint NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "image_url" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "device" "text" DEFAULT 'all'::"text" NOT NULL,
    "focus" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "hero_slides_device_check" CHECK (("device" = ANY (ARRAY['all'::"text", 'desktop'::"text", 'mobile'::"text"])))
);


ALTER TABLE "public"."hero_slides" OWNER TO "postgres";


ALTER TABLE "public"."hero_slides" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."hero_slides_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."home_features" (
    "id" bigint NOT NULL,
    "drop_name" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "blurb" "text" DEFAULT ''::"text" NOT NULL,
    "image_url" "text",
    "mobile_image_url" "text",
    "focus" "text",
    "show_lookbook" boolean DEFAULT false NOT NULL,
    "pics" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "kind" "text" DEFAULT 'drop'::"text" NOT NULL,
    "link" "text",
    "link_label" "text",
    CONSTRAINT "home_features_kind_check" CHECK (("kind" = ANY (ARRAY['drop'::"text", 'editorial'::"text"])))
);


ALTER TABLE "public"."home_features" OWNER TO "postgres";


ALTER TABLE "public"."home_features" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."home_features_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_mobile" "text",
    "customer_address" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "subtotal" numeric DEFAULT 0,
    "delivery_charge" numeric DEFAULT 0,
    "total" numeric NOT NULL,
    "issue_date" "date" NOT NULL,
    "status" "text" DEFAULT 'issued'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['issued'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lookbook_looks" (
    "id" bigint NOT NULL,
    "drop_name" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "product_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "item_labels" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "focus" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lookbook_looks" OWNER TO "postgres";


ALTER TABLE "public"."lookbook_looks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lookbook_looks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."meta_ad_daily" (
    "day" "date" NOT NULL,
    "platform" "text" NOT NULL,
    "campaign_name" "text" DEFAULT ''::"text" NOT NULL,
    "spend" numeric DEFAULT 0 NOT NULL,
    "impressions" bigint DEFAULT 0 NOT NULL,
    "clicks" bigint DEFAULT 0 NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."meta_ad_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nav_categories" (
    "id" bigint NOT NULL,
    "label" "text" NOT NULL,
    "menu" "text" DEFAULT 'shop'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "link" "text"
);


ALTER TABLE "public"."nav_categories" OWNER TO "postgres";


ALTER TABLE "public"."nav_categories" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."nav_categories_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."newsletter_subscribers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."newsletter_subscribers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "mobile" "text" NOT NULL,
    "address" "text" NOT NULL,
    "district" "text" NOT NULL,
    "area" "text",
    "notes" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "subtotal" numeric DEFAULT 0,
    "delivery_charge" numeric DEFAULT 0,
    "total" numeric NOT NULL,
    "payment_method" "text" DEFAULT 'cod'::"text",
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "tracking_note" "text",
    "admin_notes" "text",
    "invoice_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "bkash_transaction_id" "text",
    "shipping_method" "text",
    "coupon_code" "text",
    "discount_amount" numeric DEFAULT 0 NOT NULL,
    "refunded_amount" numeric DEFAULT 0 NOT NULL,
    "advance_verified_at" timestamp with time zone,
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "courier" "text",
    "consignment_id" "text",
    "courier_status" "text",
    "courier_synced_at" timestamp with time zone,
    "advance_amount" numeric DEFAULT 0 NOT NULL,
    "confirmation_sent_at" timestamp with time zone,
    "stock_mode" "text",
    "stock_taken" boolean DEFAULT false NOT NULL,
    CONSTRAINT "orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'advance_paid'::"text", 'paid'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'processing'::"text", 'shipped'::"text", 'delivered'::"text", 'returned'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."order_lines" WITH ("security_invoker"='true') AS
 SELECT "o"."order_id",
    (("x"."n" - 1))::integer AS "line",
    COALESCE(("x"."item" ->> 'product_id'::"text"), ("x"."item" ->> 'productId'::"text")) AS "product_id",
    COALESCE(("x"."item" ->> 'product_name'::"text"), ("x"."item" ->> 'name'::"text"), ''::"text") AS "product_name",
    COALESCE(("x"."item" ->> 'size'::"text"), ''::"text") AS "size",
    COALESCE((("x"."item" ->> 'quantity'::"text"))::integer, (("x"."item" ->> 'qty'::"text"))::integer, 0) AS "qty",
    COALESCE((("x"."item" ->> 'price'::"text"))::numeric, (0)::numeric) AS "price",
    COALESCE((("x"."item" ->> 'returned_qty'::"text"))::integer, 0) AS "returned_qty"
   FROM ("public"."orders" "o"
     CROSS JOIN LATERAL "jsonb_array_elements"(
        CASE
            WHEN ("jsonb_typeof"("o"."items") = 'array'::"text") THEN "o"."items"
            ELSE '[]'::"jsonb"
        END) WITH ORDINALITY "x"("item", "n"));


ALTER VIEW "public"."order_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_returns" (
    "id" bigint NOT NULL,
    "order_id" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "note" "text",
    "kind" "text" DEFAULT 'return'::"text" NOT NULL,
    "source" "text" DEFAULT 'admin'::"text" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "details" "text",
    "contact" "text",
    "admin_note" "text",
    "seen_at" timestamp with time zone,
    "resolution" "jsonb",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."order_returns" OWNER TO "postgres";


ALTER TABLE "public"."order_returns" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."order_returns_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."page_views" (
    "id" bigint NOT NULL,
    "session_id" "text" NOT NULL,
    "path" "text" NOT NULL,
    "referrer" "text",
    "device" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."page_views" OWNER TO "postgres";


ALTER TABLE "public"."page_views" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."page_views_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "category" "text" NOT NULL,
    "price" numeric NOT NULL,
    "original_price" numeric,
    "cost_price" numeric DEFAULT 0,
    "quantity" numeric DEFAULT 0,
    "size_stock" "jsonb" DEFAULT '{}'::"jsonb",
    "sku" "text",
    "description" "text" NOT NULL,
    "details" "text",
    "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sizes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "colors" "text"[] DEFAULT '{}'::"text"[],
    "stock_status" "text" DEFAULT 'in_stock'::"text",
    "is_featured" boolean DEFAULT false,
    "is_new_arrival" boolean DEFAULT false,
    "is_best_seller" boolean DEFAULT false,
    "discount_percentage" numeric DEFAULT 0,
    "fabric" "text",
    "care_instructions" "text",
    "sort_order" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "variant" "text",
    "drop_name" "text",
    "sizes_out" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "size_chart" "jsonb",
    "colour_group" "text",
    "publish_at" timestamp with time zone,
    "shop_position" integer,
    CONSTRAINT "products_category_check" CHECK (("btrim"("category") <> ''::"text")),
    CONSTRAINT "products_stock_status_check" CHECK (("stock_status" = ANY (ARRAY['in_stock'::"text", 'low_stock'::"text", 'out_of_stock'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'user'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "public_key" "text" NOT NULL,
    "private_jwk" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_config_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."push_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_sent" (
    "order_id" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_sent" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit_hits" (
    "id" bigint NOT NULL,
    "bucket" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limit_hits" OWNER TO "postgres";


ALTER TABLE "public"."rate_limit_hits" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."rate_limit_hits_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_id" "uuid",
    "product_name" "text" NOT NULL,
    "author_name" "text" NOT NULL,
    "rating" numeric NOT NULL,
    "comment" "text" NOT NULL,
    "is_approved" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= (1)::numeric) AND ("rating" <= (5)::numeric)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" bigint NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "percent" integer NOT NULL,
    "drop_name" "text",
    "product_ids" "text"[],
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "sales_percent_check" CHECK ((("percent" >= 1) AND ("percent" <= 90))),
    CONSTRAINT "sales_window" CHECK (("ends_at" > "starts_at"))
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


ALTER TABLE "public"."sales" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sales_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "store_name" "text" DEFAULT 'SUNDAY'::"text" NOT NULL,
    "store_email" "text",
    "store_phone" "text",
    "store_address" "text",
    "dhaka_delivery_charge" numeric DEFAULT 60,
    "outside_dhaka_delivery_charge" numeric DEFAULT 120,
    "facebook_url" "text",
    "instagram_url" "text",
    "whatsapp_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."site_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_stats" (
    "id" bigint NOT NULL,
    "platform" "text" NOT NULL,
    "followers" integer DEFAULT 0 NOT NULL,
    "engagement_rate" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "captured_on" "date",
    "media_count" integer
);


ALTER TABLE "public"."social_stats" OWNER TO "postgres";


ALTER TABLE "public"."social_stats" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."social_stats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."wishlist" (
    "id" bigint NOT NULL,
    "product_id" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "size" "text",
    "email" "text" NOT NULL,
    "notified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wishlist" OWNER TO "postgres";


ALTER TABLE "public"."wishlist" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."wishlist_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."wishlist_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_id" "uuid",
    "user_session" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wishlist_items" OWNER TO "postgres";


ALTER TABLE ONLY "public"."abandoned_carts"
    ADD CONSTRAINT "abandoned_carts_pkey" PRIMARY KEY ("session_id");



ALTER TABLE ONLY "public"."about_blocks"
    ADD CONSTRAINT "about_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ad_spend"
    ADD CONSTRAINT "ad_spend_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_notice_state"
    ADD CONSTRAINT "admin_notice_state_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."blocked_attempts"
    ADD CONSTRAINT "blocked_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blocked_customers"
    ADD CONSTRAINT "blocked_customers_kind_value_key" UNIQUE ("kind", "value");



ALTER TABLE ONLY "public"."blocked_customers"
    ADD CONSTRAINT "blocked_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."drop_costs"
    ADD CONSTRAINT "drop_costs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_campaigns"
    ADD CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hero_slides"
    ADD CONSTRAINT "hero_slides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_features"
    ADD CONSTRAINT "home_features_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lookbook_looks"
    ADD CONSTRAINT "lookbook_looks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meta_ad_daily"
    ADD CONSTRAINT "meta_ad_daily_pkey" PRIMARY KEY ("day", "platform", "campaign_name");



ALTER TABLE ONLY "public"."nav_categories"
    ADD CONSTRAINT "nav_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."newsletter_subscribers"
    ADD CONSTRAINT "newsletter_subscribers_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."newsletter_subscribers"
    ADD CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_returns"
    ADD CONSTRAINT "order_returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_views"
    ADD CONSTRAINT "page_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_config"
    ADD CONSTRAINT "push_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_sent"
    ADD CONSTRAINT "push_sent_pkey" PRIMARY KEY ("order_id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("endpoint");



ALTER TABLE ONLY "public"."rate_limit_hits"
    ADD CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."social_stats"
    ADD CONSTRAINT "social_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlist_items"
    ADD CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlist"
    ADD CONSTRAINT "wishlist_pkey" PRIMARY KEY ("id");



CREATE INDEX "abandoned_carts_active_idx" ON "public"."abandoned_carts" USING "btree" ("last_active") WHERE ("converted_order_id" IS NULL);



CREATE INDEX "blocked_attempts_created_idx" ON "public"."blocked_attempts" USING "btree" ("created_at" DESC);



CREATE INDEX "drop_costs_drop_idx" ON "public"."drop_costs" USING "btree" ("lower"("drop_name"), "spent_on");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_mobile" ON "public"."orders" USING "btree" ("mobile");



CREATE INDEX "idx_orders_order_id" ON "public"."orders" USING "btree" ("order_id");



CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category");



CREATE INDEX "idx_products_created_at" ON "public"."products" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_reviews_product_id" ON "public"."reviews" USING "btree" ("product_id");



CREATE INDEX "lookbook_looks_drop_idx" ON "public"."lookbook_looks" USING "btree" ("drop_name", "sort_order");



CREATE INDEX "order_returns_order_idx" ON "public"."order_returns" USING "btree" ("order_id");



CREATE INDEX "order_returns_status_idx" ON "public"."order_returns" USING "btree" ("status");



CREATE INDEX "order_returns_unseen_idx" ON "public"."order_returns" USING "btree" ("created_at") WHERE (("seen_at" IS NULL) AND ("source" = 'customer'::"text"));



CREATE INDEX "orders_consignment_idx" ON "public"."orders" USING "btree" ("consignment_id") WHERE ("consignment_id" IS NOT NULL);



CREATE INDEX "orders_coupon_code_idx" ON "public"."orders" USING "btree" ("coupon_code") WHERE ("coupon_code" IS NOT NULL);



CREATE INDEX "page_views_created_session_idx" ON "public"."page_views" USING "btree" ("created_at", "session_id");



CREATE INDEX "page_views_session_idx" ON "public"."page_views" USING "btree" ("session_id");



CREATE INDEX "products_colour_group_idx" ON "public"."products" USING "btree" ("colour_group");



CREATE INDEX "products_drop_name_idx" ON "public"."products" USING "btree" ("drop_name");



CREATE INDEX "rate_limit_hits_bucket_idx" ON "public"."rate_limit_hits" USING "btree" ("bucket", "created_at");



CREATE UNIQUE INDEX "social_stats_daily_idx" ON "public"."social_stats" USING "btree" ("platform", "captured_on") WHERE ("source" = 'meta'::"text");



CREATE UNIQUE INDEX "wishlist_open_request_idx" ON "public"."wishlist" USING "btree" ("product_id", COALESCE("size", ''::"text"), "lower"("email")) WHERE ("notified_at" IS NULL);



CREATE INDEX "wishlist_product_idx" ON "public"."wishlist" USING "btree" ("product_id");



CREATE OR REPLACE TRIGGER "contact_messages_rate_limit_hit" AFTER INSERT ON "public"."contact_messages" FOR EACH ROW EXECUTE FUNCTION "public"."record_rate_limit_hit"('contact', '3600');



CREATE OR REPLACE TRIGGER "newsletter_rate_limit_hit" AFTER INSERT ON "public"."newsletter_subscribers" FOR EACH ROW EXECUTE FUNCTION "public"."record_rate_limit_hit"('newsletter', '3600');



CREATE OR REPLACE TRIGGER "orders_notify_new" AFTER INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_order"();



CREATE OR REPLACE TRIGGER "profiles_role_follows_email" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sunday_profile_role"();



CREATE OR REPLACE TRIGGER "reviews_rate_limit_hit" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."record_rate_limit_hit"('review', '3600');



CREATE OR REPLACE TRIGGER "wishlist_rate_limit_hit" AFTER INSERT ON "public"."wishlist" FOR EACH ROW EXECUTE FUNCTION "public"."record_rate_limit_hit"('wishlist_join', '3600');



ALTER TABLE ONLY "public"."abandoned_carts"
    ADD CONSTRAINT "abandoned_carts_converted_order_id_fkey" FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("order_id");



ALTER TABLE ONLY "public"."order_returns"
    ADD CONSTRAINT "order_returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wishlist_items"
    ADD CONSTRAINT "wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



CREATE POLICY "Admin only delete invoices" ON "public"."invoices" FOR DELETE USING ((("auth"."jwt"() ->> 'email'::"text") = 'sundayclothin@gmail.com'::"text"));



CREATE POLICY "Admin only delete orders" ON "public"."orders" FOR DELETE USING ((("auth"."jwt"() ->> 'email'::"text") = 'sundayclothin@gmail.com'::"text"));



CREATE POLICY "Admin only update invoices" ON "public"."invoices" FOR UPDATE USING ((("auth"."jwt"() ->> 'email'::"text") = 'sundayclothin@gmail.com'::"text"));



CREATE POLICY "Admin only update orders" ON "public"."orders" FOR UPDATE USING ((("auth"."jwt"() ->> 'email'::"text") = 'sundayclothin@gmail.com'::"text"));



CREATE POLICY "Admin removes from the mailing list" ON "public"."newsletter_subscribers" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete reviews" ON "public"."reviews" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can moderate reviews" ON "public"."reviews" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update orders" ON "public"."orders" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can view all orders" ON "public"."orders" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view contact messages" ON "public"."contact_messages" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view subscribers" ON "public"."newsletter_subscribers" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins manage drop costs" ON "public"."drop_costs" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage the block list" ON "public"."blocked_customers" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins read Meta ad spend" ON "public"."meta_ad_daily" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins see the notified phones" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Anyone can join the wishlist" ON "public"."wishlist" FOR INSERT TO "authenticated", "anon" WITH CHECK (("public"."rate_limit_ok"('wishlist_join'::"text", 5, 3600) AND ((("auth"."jwt"() ->> 'email'::"text") IS NULL) OR ("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))));



CREATE POLICY "Anyone can log a page view" ON "public"."page_views" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Anyone can read the visible about page" ON "public"."about_blocks" FOR SELECT TO "anon" USING (("active" = true));



CREATE POLICY "Anyone can read the visible shop menu" ON "public"."nav_categories" FOR SELECT TO "authenticated", "anon" USING ((("active" = true) OR "public"."is_admin"()));



CREATE POLICY "Anyone can send a contact message" ON "public"."contact_messages" FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."rate_limit_ok"('contact'::"text", 5, 3600));



CREATE POLICY "Anyone can submit a review" ON "public"."reviews" FOR INSERT TO "authenticated", "anon" WITH CHECK (((COALESCE("is_approved", false) = false) AND "public"."rate_limit_ok"('review'::"text", 3, 3600)));



CREATE POLICY "Anyone can subscribe" ON "public"."newsletter_subscribers" FOR INSERT TO "authenticated", "anon" WITH CHECK ("public"."rate_limit_ok"('newsletter'::"text", 5, 3600));



CREATE POLICY "Anyone can view products" ON "public"."products" FOR SELECT TO "authenticated", "anon" USING ((("publish_at" IS NULL) OR ("publish_at" <= "now"()) OR "public"."is_admin"()));



CREATE POLICY "Anyone reads live sales" ON "public"."sales" FOR SELECT TO "authenticated", "anon" USING (("active" AND ("ends_at" > "now"())));



CREATE POLICY "Anyone reads site settings" ON "public"."site_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Anyone reads visible hero slides" ON "public"."hero_slides" FOR SELECT TO "authenticated", "anon" USING (("active" OR "public"."is_admin"()));



CREATE POLICY "Anyone reads visible home features" ON "public"."home_features" FOR SELECT TO "authenticated", "anon" USING (("active" OR "public"."is_admin"()));



CREATE POLICY "Anyone reads visible looks" ON "public"."lookbook_looks" FOR SELECT TO "authenticated", "anon" USING ("active");



CREATE POLICY "Approved reviews are public" ON "public"."reviews" FOR SELECT USING ((("is_approved" = true) OR "public"."is_admin"()));



CREATE POLICY "Only admins can access expenses" ON "public"."expenses" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Only admins can access invoices" ON "public"."invoices" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Only admins can modify products" ON "public"."products" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Only admins can modify settings" ON "public"."settings" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Settings are public read" ON "public"."settings" FOR SELECT USING (true);



CREATE POLICY "Signed-in admins manage abandoned carts" ON "public"."abandoned_carts" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage ad spend" ON "public"."ad_spend" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage coupons" ON "public"."coupons" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage email campaigns" ON "public"."email_campaigns" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage hero slides" ON "public"."hero_slides" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage home features" ON "public"."home_features" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage looks" ON "public"."lookbook_looks" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage notice state" ON "public"."admin_notice_state" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage returns" ON "public"."order_returns" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage sales" ON "public"."sales" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage site settings" ON "public"."site_settings" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage social stats" ON "public"."social_stats" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage the about page" ON "public"."about_blocks" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage the shop menu" ON "public"."nav_categories" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins manage the wishlist" ON "public"."wishlist" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Signed-in admins read blocked attempts" ON "public"."blocked_attempts" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Signed-in admins read page views" ON "public"."page_views" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."is_admin"()));



CREATE POLICY "Users manage their own wishlist items" ON "public"."wishlist_items" USING (true) WITH CHECK (true);



ALTER TABLE "public"."abandoned_carts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."about_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ad_spend" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_notice_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blocked_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blocked_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drop_costs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hero_slides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."home_features" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lookbook_looks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meta_ad_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nav_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."newsletter_subscribers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_returns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_sent" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limit_hits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlist_items" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































REVOKE ALL ON FUNCTION "public"."adjust_size_stock"("p_product_id" "text", "p_size" "text", "p_delta" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_size_stock"("p_product_id" "text", "p_size" "text", "p_delta" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_analytics"("p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_analytics"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_analytics"("p_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_process_return"("p_return_id" bigint, "p_action" "text", "p_items" "jsonb", "p_refund" numeric, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_process_return"("p_return_id" bigint, "p_action" "text", "p_items" "jsonb", "p_refund" numeric, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_process_return"("p_return_id" bigint, "p_action" "text", "p_items" "jsonb", "p_refund" numeric, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_coupon"("p_code" "text", "p_subtotal" numeric, "p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_coupon"("p_code" "text", "p_subtotal" numeric, "p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_coupon"("p_code" "text", "p_subtotal" numeric, "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_coupon"("p_code" "text", "p_subtotal" numeric, "p_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_rate_limit"("action" "text", "max_count" integer, "window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("action" "text", "max_count" integer, "window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."checkout_phone_check"("p_mobile" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."checkout_phone_check"("p_mobile" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkout_phone_check"("p_mobile" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkout_phone_check"("p_mobile" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."client_ip"() TO "anon";
GRANT ALL ON FUNCTION "public"."client_ip"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."client_ip"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."coupon_discount"("p_code" "text", "p_subtotal" numeric, "p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."coupon_discount"("p_code" "text", "p_subtotal" numeric, "p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_order"("p_full_name" "text", "p_email" "text", "p_mobile" "text", "p_address" "text", "p_district" "text", "p_area" "text", "p_notes" "text", "p_items" "jsonb", "p_payment_method" "text", "p_bkash_transaction_id" "text", "p_coupon_code" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order"("p_full_name" "text", "p_email" "text", "p_mobile" "text", "p_address" "text", "p_district" "text", "p_area" "text", "p_notes" "text", "p_items" "jsonb", "p_payment_method" "text", "p_bkash_transaction_id" "text", "p_coupon_code" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order"("p_full_name" "text", "p_email" "text", "p_mobile" "text", "p_address" "text", "p_district" "text", "p_area" "text", "p_notes" "text", "p_items" "jsonb", "p_payment_method" "text", "p_bkash_transaction_id" "text", "p_coupon_code" "text", "p_utm_source" "text", "p_utm_medium" "text", "p_utm_campaign" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_cart_converted"("p_session_id" "text", "p_order_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_cart_converted"("p_session_id" "text", "p_order_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_cart_converted"("p_session_id" "text", "p_order_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_cart_converted"("p_session_id" "text", "p_order_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."needs_advance"("p_mobile" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."needs_advance"("p_mobile" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_bd_phone"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_bd_phone"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_bd_phone"("p" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_order"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_order"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_order"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."number_is_risky"("p_mobile" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."number_is_risky"("p_mobile" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."order_stock_move"("p_order_id" "text", "p_sign" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."order_stock_move"("p_order_id" "text", "p_sign" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."place_order"("payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."place_order"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."place_order"("payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rate_limit_ok"("action" "text", "max_count" integer, "window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rate_limit_ok"("action" "text", "max_count" integer, "window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."rate_limit_ok"("action" "text", "max_count" integer, "window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rate_limit_ok"("action" "text", "max_count" integer, "window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_rate_limit_hit"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_rate_limit_hit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_rate_limit_hit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_products"("ids" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_products"("ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_products"("ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sale_price"("p_price" numeric, "p_product_id" "text", "p_drop" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sale_price"("p_price" numeric, "p_product_id" "text", "p_drop" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sale_price"("p_price" numeric, "p_product_id" "text", "p_drop" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sale_price"("p_price" numeric, "p_product_id" "text", "p_drop" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_abandoned_cart"("p_session_id" "text", "p_name" "text", "p_phone" "text", "p_items" "jsonb", "p_cart_value" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_abandoned_cart"("p_session_id" "text", "p_name" "text", "p_phone" "text", "p_items" "jsonb", "p_cart_value" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."save_abandoned_cart"("p_session_id" "text", "p_name" "text", "p_phone" "text", "p_items" "jsonb", "p_cart_value" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_abandoned_cart"("p_session_id" "text", "p_name" "text", "p_phone" "text", "p_items" "jsonb", "p_cart_value" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."sunday_profile_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."sunday_profile_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sunday_profile_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sunday_sync_stock_totals"("p_product_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sunday_sync_stock_totals"("p_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."support_find_order"("p_order_id" "text", "p_contact" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."support_find_order"("p_order_id" "text", "p_contact" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."support_find_order"("p_order_id" "text", "p_contact" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."support_match_order"("p_order_id" "text", "p_contact" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."support_match_order"("p_order_id" "text", "p_contact" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."support_request_return"("p_order_id" "text", "p_contact" "text", "p_kind" "text", "p_reason" "text", "p_items" "jsonb", "p_details" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."support_request_return"("p_order_id" "text", "p_contact" "text", "p_kind" "text", "p_reason" "text", "p_items" "jsonb", "p_details" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."support_request_return"("p_order_id" "text", "p_contact" "text", "p_kind" "text", "p_reason" "text", "p_items" "jsonb", "p_details" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."track_order"("p_order_id" "text", "p_mobile" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."track_order"("p_order_id" "text", "p_mobile" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."track_order"("p_order_id" "text", "p_mobile" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_order"("p_order_id" "text", "p_mobile" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_order_status"("p_order_id" "text", "p_new_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "text", "p_new_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_order_status"("p_order_id" "text", "p_new_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_advance"("p_trx" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_advance"("p_trx" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_advance"("p_trx" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_advance"("p_trx" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."abandoned_carts" TO "anon";
GRANT ALL ON TABLE "public"."abandoned_carts" TO "authenticated";
GRANT ALL ON TABLE "public"."abandoned_carts" TO "service_role";



GRANT ALL ON TABLE "public"."about_blocks" TO "anon";
GRANT ALL ON TABLE "public"."about_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."about_blocks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."about_blocks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."about_blocks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."about_blocks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ad_spend" TO "anon";
GRANT ALL ON TABLE "public"."ad_spend" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_spend" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ad_spend_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ad_spend_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ad_spend_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admin_notice_state" TO "anon";
GRANT ALL ON TABLE "public"."admin_notice_state" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notice_state" TO "service_role";



GRANT ALL ON TABLE "public"."blocked_attempts" TO "anon";
GRANT ALL ON TABLE "public"."blocked_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."blocked_attempts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."blocked_attempts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."blocked_attempts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."blocked_attempts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."blocked_customers" TO "anon";
GRANT ALL ON TABLE "public"."blocked_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."blocked_customers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."blocked_customers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."blocked_customers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."blocked_customers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contact_messages" TO "anon";
GRANT ALL ON TABLE "public"."contact_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";



GRANT ALL ON TABLE "public"."coupons" TO "anon";
GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";



GRANT ALL ON TABLE "public"."drop_costs" TO "anon";
GRANT ALL ON TABLE "public"."drop_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."drop_costs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."drop_costs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."drop_costs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."drop_costs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."email_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."email_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."email_campaigns" TO "service_role";



GRANT ALL ON SEQUENCE "public"."email_campaigns_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."email_campaigns_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."email_campaigns_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."hero_slides" TO "anon";
GRANT ALL ON TABLE "public"."hero_slides" TO "authenticated";
GRANT ALL ON TABLE "public"."hero_slides" TO "service_role";



GRANT ALL ON SEQUENCE "public"."hero_slides_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."hero_slides_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."hero_slides_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."home_features" TO "anon";
GRANT ALL ON TABLE "public"."home_features" TO "authenticated";
GRANT ALL ON TABLE "public"."home_features" TO "service_role";



GRANT ALL ON SEQUENCE "public"."home_features_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."home_features_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."home_features_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."lookbook_looks" TO "anon";
GRANT ALL ON TABLE "public"."lookbook_looks" TO "authenticated";
GRANT ALL ON TABLE "public"."lookbook_looks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lookbook_looks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lookbook_looks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lookbook_looks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."meta_ad_daily" TO "anon";
GRANT ALL ON TABLE "public"."meta_ad_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."meta_ad_daily" TO "service_role";



GRANT ALL ON TABLE "public"."nav_categories" TO "anon";
GRANT ALL ON TABLE "public"."nav_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."nav_categories" TO "service_role";



GRANT ALL ON SEQUENCE "public"."nav_categories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."nav_categories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."nav_categories_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_subscribers" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."order_lines" TO "service_role";



GRANT ALL ON TABLE "public"."order_returns" TO "anon";
GRANT ALL ON TABLE "public"."order_returns" TO "authenticated";
GRANT ALL ON TABLE "public"."order_returns" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_returns_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_returns_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_returns_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."page_views" TO "anon";
GRANT ALL ON TABLE "public"."page_views" TO "authenticated";
GRANT ALL ON TABLE "public"."page_views" TO "service_role";



GRANT ALL ON SEQUENCE "public"."page_views_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."page_views_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."page_views_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_config" TO "anon";
GRANT ALL ON TABLE "public"."push_config" TO "authenticated";
GRANT ALL ON TABLE "public"."push_config" TO "service_role";



GRANT ALL ON TABLE "public"."push_sent" TO "anon";
GRANT ALL ON TABLE "public"."push_sent" TO "authenticated";
GRANT ALL ON TABLE "public"."push_sent" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_hits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_hits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_hits" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rate_limit_hits_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rate_limit_hits_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rate_limit_hits_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sales_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sales_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sales_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."site_settings" TO "anon";
GRANT ALL ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";



GRANT ALL ON TABLE "public"."social_stats" TO "anon";
GRANT ALL ON TABLE "public"."social_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."social_stats" TO "service_role";



GRANT ALL ON SEQUENCE "public"."social_stats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."social_stats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."social_stats_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."wishlist" TO "anon";
GRANT ALL ON TABLE "public"."wishlist" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlist" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wishlist_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."wishlist_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wishlist_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."wishlist_items" TO "anon";
GRANT ALL ON TABLE "public"."wishlist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlist_items" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































