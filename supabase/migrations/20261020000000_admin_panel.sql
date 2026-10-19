-- ===========================================================================
-- Admin panel (ported from PAUSE): everything the new /admin reads and writes.
-- ===========================================================================
-- Additive only: new columns get defaults, new tables are created if missing,
-- functions are new names. Nothing existing is renamed or dropped, except the
-- products SELECT policy, which is replaced by one that also hides products
-- scheduled for later (publish_at).
--
-- SUNDAY differs from PAUSE in two ways the functions below account for:
--   * an order's lines live in orders.items (jsonb), not an order_items table,
--     and the order number is orders.order_id (text), not orders.id;
--   * stock comes off the shelf when an order is DELIVERED, not when it is
--     placed, and the per-size counts are products.size_stock.

begin;

-- ---------------------------------------------------------------------------
-- Rate limiting (shared by the public functions below)
-- ---------------------------------------------------------------------------

create table if not exists rate_limit_hits (
  id         bigint generated always as identity primary key,
  bucket     text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_hits_bucket_idx on rate_limit_hits (bucket, created_at);
alter table rate_limit_hits enable row level security;

-- Supabase's gateway appends the real connecting IP as the last entry of
-- x-forwarded-for. Null when missing, so the limits fail open.
create or replace function public.client_ip()
returns text
language plpgsql
stable
as $$
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

create or replace function public.check_rate_limit(action text, max_count int, window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
revoke all on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to anon, authenticated;

-- Read-only twin for RLS policies; the hit is recorded by a trigger instead.
create or replace function public.rate_limit_ok(action text, max_count int, window_seconds int)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
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
revoke all on function public.rate_limit_ok(text, int, int) from public;
grant execute on function public.rate_limit_ok(text, int, int) to anon, authenticated;

create or replace function public.record_rate_limit_hit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

-- Orders → Security: attempts the limiter turned away.
create table if not exists blocked_attempts (
  id         bigint generated always as identity primary key,
  action     text not null,
  ip         text,
  phone      text,
  email      text,
  name       text,
  created_at timestamptz not null default now()
);
create index if not exists blocked_attempts_created_idx on blocked_attempts (created_at desc);
alter table blocked_attempts enable row level security;
drop policy if exists "Signed-in admins read blocked attempts" on blocked_attempts;
create policy "Signed-in admins read blocked attempts"
  on blocked_attempts for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Products: the panel's extra fields
-- ---------------------------------------------------------------------------
-- variant       — colour or edition shown after the name ("Navy")
-- drop_name     — the collection / drop it belongs to
-- sizes_out     — sizes hidden by hand even with pieces on the shelf
-- size_chart    — {"columns":[...],"rows":[{"label":..,"values":[..]}],"notes":[..]}
-- colour_group  — products sharing it are the same piece in other colours
-- publish_at    — goes live at this time; null = live now
-- shop_position — place on the Shop all page, 1 = top

alter table products add column if not exists variant text;
alter table products add column if not exists drop_name text;
alter table products add column if not exists sizes_out text[] not null default '{}';
alter table products add column if not exists size_chart jsonb;
alter table products add column if not exists colour_group text;
alter table products add column if not exists publish_at timestamptz;
alter table products add column if not exists shop_position int;

create index if not exists products_colour_group_idx on products (colour_group);
create index if not exists products_drop_name_idx on products (drop_name);

-- Scheduled products stay hidden from visitors until publish_at. Every
-- existing SELECT policy is replaced so none can keep showing them.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
              where schemaname = 'public' and tablename = 'products' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on products', pol.policyname);
  end loop;
end $$;

create policy "Anyone can view products"
  on products for select
  to anon, authenticated
  using (publish_at is null or publish_at <= now() or public.is_admin());

create or replace function public.reorder_products(ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
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
revoke all on function public.reorder_products(text[]) from public, anon;
grant execute on function public.reorder_products(text[]) to authenticated;

-- Keeps quantity and stock_status (what the storefront reads) in step with
-- the per-size counts.
create or replace function public.sunday_sync_stock_totals(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;
revoke all on function public.sunday_sync_stock_totals(uuid) from public, anon, authenticated;

-- Adds p_delta to one size, if that size is counted. Returns the new count,
-- or null for an untracked size.
create or replace function public.adjust_size_stock(p_product_id text, p_size text, p_delta int)
returns int
language plpgsql
security definer
set search_path = public
as $$
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
revoke all on function public.adjust_size_stock(text, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Orders: the panel's extra fields
-- ---------------------------------------------------------------------------

alter table orders add column if not exists coupon_code text;
alter table orders add column if not exists discount_amount numeric not null default 0;
alter table orders add column if not exists refunded_amount numeric not null default 0;
alter table orders add column if not exists advance_verified_at timestamptz;
alter table orders add column if not exists utm_source text;
alter table orders add column if not exists utm_medium text;
alter table orders add column if not exists utm_campaign text;
alter table orders add column if not exists courier text;
alter table orders add column if not exists consignment_id text;
alter table orders add column if not exists courier_status text;
alter table orders add column if not exists courier_synced_at timestamptz;

create index if not exists orders_coupon_code_idx on orders (coupon_code) where coupon_code is not null;
create index if not exists orders_consignment_idx on orders (consignment_id) where consignment_id is not null;

-- One row per line of every order, read out of orders.items. Not exposed to
-- the API: only the security-definer functions below use it.
create or replace view public.order_lines
with (security_invoker = true)
as
select
  o.order_id,
  (x.n - 1)::int                                                  as line,
  coalesce(x.item ->> 'product_id', x.item ->> 'productId')       as product_id,
  coalesce(x.item ->> 'product_name', x.item ->> 'name', '')      as product_name,
  coalesce(x.item ->> 'size', '')                                 as size,
  coalesce((x.item ->> 'quantity')::int, (x.item ->> 'qty')::int, 0) as qty,
  coalesce((x.item ->> 'price')::numeric, 0)                      as price,
  coalesce((x.item ->> 'returned_qty')::int, 0)                   as returned_qty
from orders o
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end
) with ordinality as x(item, n);

revoke all on public.order_lines from public, anon, authenticated;

-- Status change from the panel. SUNDAY takes stock off when an order is
-- first delivered and puts it back if it is moved off delivered again, in
-- one transaction with the status itself. p_order_id is the order number.
create or replace function public.update_order_status(p_order_id text, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status text;
  l          record;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  select status into old_status from orders where order_id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if p_new_status = 'delivered' and old_status is distinct from 'delivered' then
    for l in select product_id, size, qty - returned_qty as qty from order_lines where order_id = p_order_id loop
      if l.qty > 0 and l.product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        update products
           set size_stock = case
                 when size_stock ? l.size
                   then jsonb_set(size_stock, array[l.size], to_jsonb(greatest(0, coalesce((size_stock ->> l.size)::int, 0) - l.qty)))
                 else size_stock end,
               quantity = case when size_stock ? l.size then quantity else greatest(0, coalesce(quantity, 0) - l.qty) end
         where id::text = l.product_id;
        perform public.sunday_sync_stock_totals(l.product_id::uuid);
      end if;
    end loop;
  elsif old_status = 'delivered' and p_new_status is distinct from 'delivered' then
    for l in select product_id, size, qty - returned_qty as qty from order_lines where order_id = p_order_id loop
      if l.qty > 0 and l.product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        update products
           set size_stock = case
                 when size_stock ? l.size
                   then jsonb_set(size_stock, array[l.size], to_jsonb(coalesce((size_stock ->> l.size)::int, 0) + l.qty))
                 else size_stock end,
               quantity = case when size_stock ? l.size then quantity else coalesce(quantity, 0) + l.qty end
         where id::text = l.product_id;
        perform public.sunday_sync_stock_totals(l.product_id::uuid);
      end if;
    end loop;
  end if;

  update orders set status = p_new_status, updated_at = now() where order_id = p_order_id;
end;
$$;
revoke all on function public.update_order_status(text, text) from public, anon;
grant execute on function public.update_order_status(text, text) to authenticated;

-- An order agreed over DM, entered from Orders → New order. Same shape the
-- panel sends PAUSE's place_order; written into SUNDAY's orders row. Prices
-- come from the products table, not the browser.
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

  new_id := 'SND-' || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint));

  insert into orders (
    order_id, full_name, email, mobile, address, district, area, notes, admin_notes,
    items, subtotal, delivery_charge, total, payment_method, payment_status,
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
    case when advance > 0 then 'bkash_advance' else 'cod' end,
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
revoke all on function public.place_order(jsonb) from public, anon;
grant execute on function public.place_order(jsonb) to authenticated;

-- Orders → bKash check: marks the order carrying this TrxID as verified.
create or replace function public.verify_advance(p_trx text)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
   where upper(bkash_transaction_id) = clean and payment_method = 'bkash_advance'
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
revoke all on function public.verify_advance(text) from public;
grant execute on function public.verify_advance(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Refunds & exchanges
-- ---------------------------------------------------------------------------

create table if not exists order_returns (
  id          bigint generated always as identity primary key,
  order_id    text not null references orders(order_id) on delete cascade,
  reason      text not null,
  status      text not null default 'open',
  note        text,
  kind        text not null default 'return',
  source      text not null default 'admin',
  items       jsonb not null default '[]',
  details     text,
  contact     text,
  admin_note  text,
  seen_at     timestamptz,
  resolution  jsonb,
  processed_at timestamptz,
  created_at  timestamptz default now(),
  resolved_at timestamptz
);
create index if not exists order_returns_order_idx on order_returns (order_id);
create index if not exists order_returns_status_idx on order_returns (status);
create index if not exists order_returns_unseen_idx
  on order_returns (created_at) where seen_at is null and source = 'customer';
alter table order_returns enable row level security;
drop policy if exists "Signed-in admins manage returns" on order_returns;
create policy "Signed-in admins manage returns"
  on order_returns for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Which order an order number + email/phone pair belongs to (last nine
-- digits of a phone, so 017…, +88017… and 88017… all match).
create or replace function public.support_match_order(p_order_id text, p_contact text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
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
revoke all on function public.support_match_order(text, text) from public, anon, authenticated;

create or replace function public.support_find_order(p_order_id text, p_contact text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
grant execute on function public.support_find_order(text, text) to anon, authenticated;

create or replace function public.support_request_return(
  p_order_id text, p_contact text, p_kind text, p_reason text, p_items jsonb, p_details text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
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
grant execute on function public.support_request_return(text, text, text, text, jsonb, text) to anon, authenticated;

-- Completes a request. item_id is the line's position in orders.items
-- (0 = first). An exchange swaps sizes in stock; a refund puts the pieces
-- back, marks them returned on the order and records the money given back.
create or replace function public.admin_process_return(
  p_return_id bigint, p_action text, p_items jsonb, p_refund numeric, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
revoke all on function public.admin_process_return(bigint, text, jsonb, numeric, text) from public, anon;
grant execute on function public.admin_process_return(bigint, text, jsonb, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Abandoned carts
-- ---------------------------------------------------------------------------

create table if not exists abandoned_carts (
  session_id         text primary key,
  customer_name      text,
  customer_phone     text,
  items              jsonb not null default '[]',
  cart_value         numeric not null default 0,
  last_active        timestamptz default now(),
  created_at         timestamptz default now(),
  converted_order_id text references orders(order_id)
);
create index if not exists abandoned_carts_active_idx on abandoned_carts (last_active)
  where converted_order_id is null;
alter table abandoned_carts enable row level security;
drop policy if exists "Signed-in admins manage abandoned carts" on abandoned_carts;
create policy "Signed-in admins manage abandoned carts"
  on abandoned_carts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.save_abandoned_cart(
  p_session_id text, p_name text, p_phone text, p_items jsonb, p_cart_value numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.mark_cart_converted(p_session_id text, p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update abandoned_carts
     set converted_order_id = p_order_id
   where session_id = p_session_id
     and converted_order_id is null
     and exists (select 1 from orders where order_id = p_order_id);
end;
$$;

revoke all on function public.save_abandoned_cart(text, text, text, jsonb, numeric) from public;
grant execute on function public.save_abandoned_cart(text, text, text, jsonb, numeric) to anon, authenticated;
revoke all on function public.mark_cart_converted(text, text) from public;
grant execute on function public.mark_cart_converted(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Restock requests ("email me when it's back")
-- ---------------------------------------------------------------------------

create table if not exists wishlist (
  id           bigint generated always as identity primary key,
  product_id   text not null,
  product_name text not null,
  size         text,
  email        text not null,
  notified_at  timestamptz,
  created_at   timestamptz default now()
);
create unique index if not exists wishlist_open_request_idx
  on wishlist (product_id, coalesce(size, ''), lower(email)) where notified_at is null;
create index if not exists wishlist_product_idx on wishlist (product_id);
alter table wishlist enable row level security;

drop policy if exists "Anyone can join the wishlist" on wishlist;
create policy "Anyone can join the wishlist"
  on wishlist for insert to anon, authenticated
  with check (
    public.rate_limit_ok('wishlist_join', 5, 3600)
    and (auth.jwt() ->> 'email' is null or lower(email) = lower(auth.jwt() ->> 'email'))
  );
drop trigger if exists wishlist_rate_limit_hit on wishlist;
create trigger wishlist_rate_limit_hit
  after insert on wishlist
  for each row execute function public.record_rate_limit_hit('wishlist_join', '3600');
drop policy if exists "Signed-in admins manage the wishlist" on wishlist;
create policy "Signed-in admins manage the wishlist"
  on wishlist for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storefront content managed from the panel
-- ---------------------------------------------------------------------------

create table if not exists hero_slides (
  id         bigint generated always as identity primary key,
  label      text not null default '',
  image_url  text not null,
  sort_order int not null default 0,
  active     boolean not null default true,
  device     text not null default 'all' check (device in ('all', 'desktop', 'mobile')),
  focus      text,
  created_at timestamptz default now()
);
alter table hero_slides enable row level security;
drop policy if exists "Anyone reads visible hero slides" on hero_slides;
create policy "Anyone reads visible hero slides"
  on hero_slides for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "Signed-in admins manage hero slides" on hero_slides;
create policy "Signed-in admins manage hero slides"
  on hero_slides for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- menu = 'shop' → label matches a product category; 'drops' → a drop name.
create table if not exists nav_categories (
  id         bigint generated always as identity primary key,
  label      text not null,
  menu       text not null default 'shop',
  sort_order int default 0,
  active     boolean default true,
  created_at timestamptz default now()
);
alter table nav_categories enable row level security;
drop policy if exists "Anyone can read the visible shop menu" on nav_categories;
create policy "Anyone can read the visible shop menu"
  on nav_categories for select to anon using (active = true);
drop policy if exists "Signed-in admins manage the shop menu" on nav_categories;
create policy "Signed-in admins manage the shop menu"
  on nav_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists about_blocks (
  id          bigint generated always as identity primary key,
  image_url   text not null,
  heading     text not null default '',
  description text,
  sort_order  int default 0,
  active      boolean default true,
  created_at  timestamptz default now()
);
alter table about_blocks enable row level security;
drop policy if exists "Anyone can read the visible about page" on about_blocks;
create policy "Anyone can read the visible about page"
  on about_blocks for select to anon using (active = true);
drop policy if exists "Signed-in admins manage the about page" on about_blocks;
create policy "Signed-in admins manage the about page"
  on about_blocks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create table if not exists lookbook_looks (
  id          bigint generated always as identity primary key,
  drop_name   text not null,
  image_url   text not null,
  title       text not null default '',
  product_ids text[] not null default '{}',
  item_labels jsonb not null default '{}',
  focus       text,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz default now()
);
create index if not exists lookbook_looks_drop_idx on lookbook_looks (drop_name, sort_order);
alter table lookbook_looks enable row level security;
drop policy if exists "Anyone reads visible looks" on lookbook_looks;
create policy "Anyone reads visible looks"
  on lookbook_looks for select to anon, authenticated using (active);
drop policy if exists "Signed-in admins manage looks" on lookbook_looks;
create policy "Signed-in admins manage looks"
  on lookbook_looks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Small bits of storefront copy, one row per key (e.g. ticker lines,
-- support pages).
create table if not exists site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);
alter table site_settings enable row level security;
drop policy if exists "Anyone reads site settings" on site_settings;
create policy "Anyone reads site settings"
  on site_settings for select to anon, authenticated using (true);
drop policy if exists "Signed-in admins manage site settings" on site_settings;
create policy "Signed-in admins manage site settings"
  on site_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Coupons and sales
-- ---------------------------------------------------------------------------

create table if not exists coupons (
  code               text primary key check (code ~ '^[A-Z0-9_-]{3,24}$'),
  kind               text not null check (kind in ('percent', 'fixed')),
  value              numeric not null check (value > 0),
  min_subtotal       numeric not null default 0,
  max_discount       numeric,
  usage_limit        int,
  per_customer_limit int default 1,
  starts_at          timestamptz,
  ends_at            timestamptz,
  active             boolean not null default true,
  created_at         timestamptz default now(),
  constraint coupons_percent_range check (kind <> 'percent' or value <= 100)
);
alter table coupons enable row level security;
drop policy if exists "Signed-in admins manage coupons" on coupons;
create policy "Signed-in admins manage coupons"
  on coupons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.coupon_discount(p_code text, p_subtotal numeric, p_phone text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
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
revoke all on function public.coupon_discount(text, numeric, text) from public;

create or replace function public.check_coupon(p_code text, p_subtotal numeric, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
revoke all on function public.check_coupon(text, numeric, text) from public;
grant execute on function public.check_coupon(text, numeric, text) to anon, authenticated;

create table if not exists sales (
  id          bigint generated always as identity primary key,
  name        text not null default '',
  percent     int not null check (percent between 1 and 90),
  drop_name   text,
  product_ids text[],
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  active      boolean not null default true,
  created_at  timestamptz default now(),
  constraint sales_window check (ends_at > starts_at)
);
alter table sales enable row level security;
drop policy if exists "Anyone reads live sales" on sales;
create policy "Anyone reads live sales"
  on sales for select to anon, authenticated using (active and ends_at > now());
drop policy if exists "Signed-in admins manage sales" on sales;
create policy "Signed-in admins manage sales"
  on sales for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.sale_price(p_price numeric, p_product_id text, p_drop text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
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
revoke all on function public.sale_price(numeric, text, text) from public;

-- ---------------------------------------------------------------------------
-- Marketing (typed in by hand)
-- ---------------------------------------------------------------------------

create table if not exists ad_spend (
  id         bigint generated always as identity primary key,
  channel    text not null,
  spend      numeric not null default 0,
  revenue    numeric not null default 0,
  created_at timestamptz default now()
);
create table if not exists email_campaigns (
  id         bigint generated always as identity primary key,
  campaign   text not null,
  open_rate  numeric not null default 0,
  click_rate numeric not null default 0,
  created_at timestamptz default now()
);
create table if not exists social_stats (
  id              bigint generated always as identity primary key,
  platform        text not null,
  followers       int not null default 0,
  engagement_rate numeric not null default 0,
  created_at      timestamptz default now()
);
alter table ad_spend enable row level security;
alter table email_campaigns enable row level security;
alter table social_stats enable row level security;
drop policy if exists "Signed-in admins manage ad spend" on ad_spend;
create policy "Signed-in admins manage ad spend"
  on ad_spend for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Signed-in admins manage email campaigns" on email_campaigns;
create policy "Signed-in admins manage email campaigns"
  on email_campaigns for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Signed-in admins manage social stats" on social_stats;
create policy "Signed-in admins manage social stats"
  on social_stats for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- The panel's mailing list reads SUNDAY's existing newsletter_subscribers;
-- the admin can also take an address off it.
drop policy if exists "Admin removes from the mailing list" on newsletter_subscribers;
create policy "Admin removes from the mailing list"
  on newsletter_subscribers for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Admin notifications
-- ---------------------------------------------------------------------------

create table if not exists admin_notice_state (
  key          text primary key,
  read_at      timestamptz,
  dismissed_at timestamptz,
  created_at   timestamptz default now()
);
alter table admin_notice_state enable row level security;
drop policy if exists "Signed-in admins manage notice state" on admin_notice_state;
create policy "Signed-in admins manage notice state"
  on admin_notice_state for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Visitor analytics
-- ---------------------------------------------------------------------------

create table if not exists page_views (
  id         bigint generated always as identity primary key,
  session_id text not null,
  path       text not null,
  referrer   text,
  device     text,
  created_at timestamptz default now()
);
create index if not exists page_views_session_idx on page_views (session_id);
create index if not exists page_views_created_session_idx on page_views (created_at, session_id);
alter table page_views enable row level security;
drop policy if exists "Anyone can log a page view" on page_views;
create policy "Anyone can log a page view"
  on page_views for insert to anon, authenticated with check (true);
drop policy if exists "Signed-in admins read page views" on page_views;
create policy "Signed-in admins read page views"
  on page_views for select to authenticated using (public.is_admin());

create or replace function public.admin_analytics(p_days int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;
revoke all on function public.admin_analytics(int) from public, anon;
grant execute on function public.admin_analytics(int) to authenticated;

commit;
