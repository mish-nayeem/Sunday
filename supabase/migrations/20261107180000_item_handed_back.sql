-- Orders, as on Pause:
--
-- ✕ on an order line: the customer kept the rest of the parcel but handed
-- this piece back to the rider.
--   * It's kept on the line as items[n].rejected_qty.
--   * It goes back on the shelf, if the order had taken its stock.
--   * It comes off the cash to collect and stops counting as sold.
--   * Undo puts it back on the order.
-- Everything that counts a line's pieces now leaves those out:
--   * order_lines.rejected_qty;
--   * the stock moves on cancel / return;
--   * the Return & Exchange Portal;
--   * admin_process_return.
-- Otherwise the functions are as in 20261107150000_exchange_any_product.

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
  coalesce((x.item ->> 'returned_qty')::int, 0)                   as returned_qty,
  coalesce((x.item ->> 'rejected_qty')::int, 0)                   as rejected_qty
from orders o
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end
) with ordinality as x(item, n);

revoke all on public.order_lines from public, anon, authenticated;

-- Take (-1) or put back (+1) an order's pieces, less what came back through
-- a return or was handed back at the door (already back on the shelf).
create or replace function public.order_stock_move(p_order_id text, p_sign int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  for l in select product_id, size, qty - returned_qty - rejected_qty as qty from order_lines where order_id = p_order_id loop
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
$$;
revoke all on function public.order_stock_move(text, int) from public, anon, authenticated;

-- ✕ / ↺ on one line (p_line = its place in orders.items, 0 = first).
-- Returns the line's pieces handed back now.
create or replace function public.admin_reject_item(p_order_id text, p_line int, p_undo boolean default false)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  o    orders%rowtype;
  l    record;
  q    int;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into o from orders where order_id = p_order_id for update;
  if not found then
    raise exception 'That order no longer exists.';
  end if;
  if o.status in ('cancelled', 'returned') then
    raise exception 'This order is %, so its pieces are already back in stock.', o.status;
  end if;

  select * into l from order_lines where order_id = p_order_id and line = p_line;
  if not found then
    raise exception 'That item is no longer on the order.';
  end if;

  if not coalesce(p_undo, false) then
    q := l.qty - l.returned_qty - l.rejected_qty;
    if q <= 0 then
      return l.rejected_qty;
    end if;
    if o.stock_taken then
      perform public.adjust_size_stock(l.product_id, l.size, q);
    end if;
    update orders set items = jsonb_set(items, array[p_line::text, 'rejected_qty'], to_jsonb(l.rejected_qty + q))
     where order_id = p_order_id;
    return l.rejected_qty + q;
  end if;

  q := l.rejected_qty;
  if q = 0 then
    return 0;
  end if;
  if o.stock_taken then
    perform public.adjust_size_stock(l.product_id, l.size, -q);
  end if;
  update orders set items = jsonb_set(items, array[p_line::text, 'rejected_qty'], to_jsonb(0))
   where order_id = p_order_id;
  return 0;
end;
$$;
revoke all on function public.admin_reject_item(text, int, boolean) from public, anon;
grant execute on function public.admin_reject_item(text, int, boolean) to authenticated;

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
    'delivery_zone', case when o.district = 'Dhaka' then 'inside' else 'outside' end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', l.product_id, 'product_name', l.product_name, 'size', l.size,
        'qty', l.qty - l.returned_qty - l.rejected_qty, 'price', l.price
      ) order by l.line)
        from order_lines l where l.order_id = o.order_id and l.qty - l.returned_qty - l.rejected_qty > 0
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
  p_order_id text, p_contact text, p_kind text, p_reason text, p_items jsonb, p_details text,
  p_refund_to text default null
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
      'qty', least(greatest(coalesce((x ->> 'qty')::int, 1), 1), l.qty - l.returned_qty - l.rejected_qty),
      'exchange_size', nullif(left(trim(coalesce(x ->> 'exchange_size', '')), 20), ''),
      -- Exchanging for a different product (any price): which one, and what
      -- it sells for now, against what was paid for this piece.
      'price', l.price,
      'exchange_product_id', np.id,
      'exchange_product_name', np.name || case when coalesce(np.variant, '') <> '' then ' — ' || np.variant else '' end,
      'exchange_price', case when np.id is not null then public.sale_price(np.price, np.id, np.drop_name) end
    )), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x
  join lateral (
    select * from order_lines ol
     where ol.order_id = v_id and ol.product_name = x ->> 'product_name' and ol.size = x ->> 'size'
       and ol.qty - ol.returned_qty - ol.rejected_qty > 0
     limit 1
  ) l on true
  left join lateral (
    select p.id::text as id, p.name, p.variant, p.price, p.drop_name from products p
     where p.id::text = nullif(trim(coalesce(x ->> 'exchange_product_id', '')), '')
       and p.id::text is distinct from l.product_id
     limit 1
  ) np on true;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Pick at least one item.';
  end if;

  insert into order_returns (order_id, reason, kind, source, items, details, contact, refund_to)
  values (v_id, left(trim(p_reason), 200), p_kind, 'customer', v_items,
          nullif(left(trim(coalesce(p_details, '')), 1000), ''), left(trim(p_contact), 120),
          -- The bKash number money goes back to, when there is any.
          nullif(left(regexp_replace(coalesce(p_refund_to, ''), '[^0-9+]', '', 'g'), 20), ''))
  returning id into v_new;
  return jsonb_build_object('id', v_new);
end;
$$;
revoke all on function public.support_request_return(text, text, text, text, jsonb, text, text) from public;
grant execute on function public.support_request_return(text, text, text, text, jsonb, text, text) to anon, authenticated;

create or replace function public.admin_process_return(
  p_return_id bigint, p_action text, p_items jsonb, p_refund numeric, p_note text,
  p_fee numeric default 0, p_fee_paid boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ret        order_returns%rowtype;
  x          jsonb;
  l          record;
  item       jsonb;
  q          int;
  free_qty   int;
  to_size    text;
  to_pid     text;
  to_name    text;
  to_price   numeric;
  to_drop    text;
  to_image   text;
  new_price  numeric;
  was        text;
  price_diff numeric := 0;
  done       jsonb := '[]'::jsonb;
  left_from  int;
  left_to    int;
  refund     numeric := greatest(coalesce(p_refund, 0), 0);
  fee        numeric := greatest(coalesce(p_fee, 0), 0);
  result     jsonb;
  -- A faulty or damaged piece can't be sold again: never restocked.
  damaged    boolean;
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

  damaged := coalesce(ret.reason, '') ~* '(faulty|damage)';

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
    select items -> l.line into item from orders where order_id = ret.order_id;

    free_qty := l.qty - l.returned_qty - l.rejected_qty;
    q := least(greatest(coalesce((x ->> 'qty')::int, 0), 0), free_qty);
    if q = 0 then
      continue;
    end if;

    if p_action = 'exchange' then
      to_size := trim(coalesce(x ->> 'to_size', ''));
      if to_size = '' then
        raise exception 'Pick the new size for %.', l.product_name;
      end if;
      -- Another product in place of this one, at whatever it sells for now.
      to_pid := nullif(trim(coalesce(x ->> 'to_product_id', '')), '');
      if to_pid is null or to_pid = l.product_id then
        to_pid := l.product_id;
        to_name := l.product_name;
        new_price := l.price;
        to_image := item ->> 'image';
      else
        select p.name, p.price, p.drop_name, p.images[1] into to_name, to_price, to_drop, to_image
          from products p where p.id::text = to_pid;
        if to_name is null then
          raise exception 'The product picked in place of % no longer exists.', l.product_name;
        end if;
        new_price := public.sale_price(to_price, to_pid, to_drop);
      end if;

      if to_pid = l.product_id and to_size = l.size then
        -- The same product in the same size: a fresh copy, only for a faulty
        -- or damaged one. A fresh piece leaves the shelf; the order line
        -- stays as it is.
        if not damaged then
          raise exception 'The new size for % is the same as the old one.', l.product_name;
        end if;
        left_to := public.adjust_size_stock(to_pid, to_size, -q);
        done := done || jsonb_build_object(
          'item_id', l.line, 'product_id', l.product_id, 'product_name', l.product_name,
          'to_product_id', to_pid, 'to_product_name', to_name,
          'qty', q, 'from_size', l.size, 'to_size', to_size,
          'from_price', l.price, 'to_price', new_price,
          'from_left', left_to, 'to_left', left_to, 'fresh', true, 'damaged', true);
        continue;
      end if;

      -- The new piece first, so a size that's run out stops it before
      -- anything has moved.
      left_to := public.adjust_size_stock(to_pid, to_size, -q);
      left_from := public.adjust_size_stock(l.product_id, l.size, case when damaged then 0 else q end);
      price_diff := price_diff + (new_price - l.price) * q;
      was := case when to_pid = l.product_id then l.size else l.product_name || ' ' || l.size end;

      if q = l.qty and l.returned_qty = 0 and l.rejected_qty = 0 then
        -- The whole line changes.
        update orders
           set items = jsonb_set(items, array[l.line::text],
                 item || jsonb_build_object(
                   'product_id', to_pid, 'product_name', to_name, 'name', to_name,
                   'size', to_size, 'price', new_price,
                   'exchanged_from', coalesce(item ->> 'exchanged_from', was))
                 || case when to_image is not null then jsonb_build_object('image', to_image) else '{}'::jsonb end)
         where order_id = ret.order_id;
      else
        -- Some of its pieces: they become a line of their own.
        update orders
           set items = jsonb_set(items, array[l.line::text], public.order_item_with_qty(item, l.qty - q))
                       || jsonb_build_array(public.order_item_with_qty(
                            (item - 'returned_qty' - 'rejected_qty') || jsonb_build_object(
                              'product_id', to_pid, 'product_name', to_name, 'name', to_name,
                              'size', to_size, 'price', new_price, 'exchanged_from', was)
                            || case when to_image is not null then jsonb_build_object('image', to_image) else '{}'::jsonb end,
                            q))
         where order_id = ret.order_id;
      end if;

      done := done || jsonb_build_object(
        'item_id', l.line, 'product_id', l.product_id, 'product_name', l.product_name,
        'to_product_id', to_pid, 'to_product_name', to_name,
        'qty', q, 'from_size', l.size, 'to_size', to_size,
        'from_price', l.price, 'to_price', new_price,
        'from_left', left_from, 'to_left', left_to, 'damaged', damaged);
    else
      left_from := public.adjust_size_stock(l.product_id, l.size, case when damaged then 0 else q end);
      update orders
         set items = jsonb_set(items, array[l.line::text, 'returned_qty'], to_jsonb(l.returned_qty + q))
       where order_id = ret.order_id;
      done := done || jsonb_build_object(
        'item_id', l.line, 'product_id', l.product_id, 'product_name', l.product_name,
        'qty', q, 'size', l.size, 'price', l.price, 'left', left_from, 'damaged', damaged);
    end if;
  end loop;

  if jsonb_array_length(done) = 0 then
    raise exception 'Pick at least one piece.';
  end if;

  if p_action = 'refund' and refund > 0 then
    update orders set refunded_amount = refunded_amount + refund where order_id = ret.order_id;
  end if;

  -- An exchange's price difference: owed by the customer it's extra revenue
  -- (collected by the rider); owed to them it's refunded.
  if p_action = 'exchange' and price_diff > 0 then
    update orders set exchange_extra = exchange_extra + price_diff where order_id = ret.order_id;
  elsif p_action = 'exchange' and price_diff < 0 then
    update orders set refunded_amount = refunded_amount - price_diff where order_id = ret.order_id;
  end if;

  if fee > 0 then
    update orders
       set exchange_fees = exchange_fees + fee,
           exchange_fee_unpaid = exchange_fee_unpaid
             + case when p_action = 'refund' or not coalesce(p_fee_paid, true) then fee else 0 end
     where order_id = ret.order_id;
  end if;

  result := jsonb_build_object(
    'action', p_action, 'at', now(), 'items', done,
    'refund', case when p_action = 'refund' then refund else 0 end,
    'fee', fee,
    'fee_paid', case when p_action = 'refund' then false else coalesce(p_fee_paid, true) end,
    'price_diff', case when p_action = 'exchange' then price_diff else 0 end,
    'extra_due', case when p_action = 'exchange' then greatest(price_diff, 0) else 0 end,
    'refund_due', case when p_action = 'exchange' then greatest(-price_diff, 0) else 0 end,
    'refund_to', ret.refund_to);

  update order_returns
     set status = 'resolved', kind = p_action, resolution = result,
         admin_note = nullif(trim(coalesce(p_note, '')), ''),
         processed_at = now(), resolved_at = now(), seen_at = coalesce(seen_at, now())
   where id = p_return_id;

  return result;
end;
$$;
revoke all on function public.admin_process_return(bigint, text, jsonb, numeric, text, numeric, boolean) from public, anon;
grant execute on function public.admin_process_return(bigint, text, jsonb, numeric, text, numeric, boolean) to authenticated;
