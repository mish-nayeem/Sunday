-- Support portal (Find my order, Return & exchange requests): limits.
--
-- Both take an order number and a phone or email. Without a limit, someone
-- could guess numbers over and over to see other people's orders, or flood
-- the shop with requests. Now, per connection (IP):
--   * 10 wrong guesses an hour, then the portal stops answering for the
--     rest of the hour (a right guess doesn't count);
--   * 5 requests sent an hour;
--   * a number or connection on the block list (Orders → Security) is
--     turned away.
-- Each refusal is listed under Orders → Security → Turned away.

-- One wrong order number / contact pair from this connection.
create or replace function public.support_miss()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ip text := public.client_ip();
begin
  if ip is null then
    return;
  end if;
  delete from rate_limit_hits where bucket = 'support_lookup:' || ip and created_at < now() - interval '1 hour';
  insert into rate_limit_hits (bucket) values ('support_lookup:' || ip);
end;
$$;
revoke all on function public.support_miss() from public, anon, authenticated;

-- May this connection ask? False (and the refusal noted) when it has used
-- up its wrong guesses or is on the block list.
create or replace function public.support_gate(p_contact text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ip      text := public.client_ip();
  contact text := left(trim(coalesce(p_contact, '')), 120);
  phone   text := public.normalize_bd_phone(contact);
  why     text;
begin
  if ip is not null and exists (select 1 from blocked_customers b where b.kind = 'ip' and b.value = ip) then
    why := 'blocked_customer';
  elsif phone is not null and exists (
    select 1 from blocked_customers b where b.kind = 'phone' and public.normalize_bd_phone(b.value) = phone
  ) then
    why := 'blocked_customer';
  elsif not public.rate_limit_ok('support_lookup', 10, 3600) then
    why := 'support_lookup';
  end if;
  if why is null then
    return true;
  end if;
  insert into blocked_attempts (action, ip, phone, email)
  values (why, ip, phone, case when position('@' in contact) > 0 then lower(contact) end);
  return false;
end;
$$;
revoke all on function public.support_gate(text) from public, anon, authenticated;

create or replace function public.support_find_order(p_order_id text, p_contact text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id  text;
  v_out jsonb;
begin
  -- Too many wrong guesses from this connection: stop answering for a while.
  if not public.support_gate(p_contact) then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;
  v_id := public.support_match_order(p_order_id, p_contact);
  if v_id is null then
    perform public.support_miss();
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
  v_id     text;
  v_status text;
  v_items  jsonb;
  v_new    bigint;
begin
  if not public.support_gate(p_contact) then
    return jsonb_build_object('error', 'Too many tries from this connection. Please wait an hour, or message us on WhatsApp.');
  end if;
  v_id := public.support_match_order(p_order_id, p_contact);
  if v_id is null then
    -- Returned, not raised, so the wrong guess is still counted.
    perform public.support_miss();
    return jsonb_build_object('error', 'We couldn''t find an order with those details.');
  end if;
  -- At most 5 requests an hour from one connection (counted when one is sent).
  if not public.rate_limit_ok('support_request', 5, 3600) then
    raise exception 'Too many requests from this connection. Please wait an hour, or message us on WhatsApp.';
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
  insert into rate_limit_hits (bucket)
  select 'support_request:' || public.client_ip() where public.client_ip() is not null;
  return jsonb_build_object('id', v_new);
end;
$$;
revoke all on function public.support_request_return(text, text, text, text, jsonb, text, text) from public;
grant execute on function public.support_request_return(text, text, text, text, jsonb, text, text) to anon, authenticated;
