-- The courier's word moves the order along, and the customer can follow it.
--
-- 1. Every 30 minutes the database's clock (pg_cron) asks the courier
--    function about each parcel still on its way (action 'sync-all'). The
--    key it shows is in public.courier_sync, which only the server side can
--    read.
-- 2. Whenever orders.courier_status changes (that clock, or the admin's
--    "Sync status"):
--      • it's kept in order_courier_events, so Track order can show every
--        step the parcel went through, with its time;
--      • a pending / confirmed / processing order the courier now has
--        becomes "shipped";
--      • "delivered" makes the order delivered — stock handled the same way
--        update_order_status does it — and emails the customer once
--        (send-status-update, with the same key).
--    Left to the admin on purpose: cancelled / returned / partly delivered.
--    Those put stock back or change money, so they wait for the parcel to be
--    in hand.
-- 3. track_order also returns those steps.

-- 1 ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.courier_sync (
  id integer primary key default 1 check (id = 1),
  token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.courier_sync enable row level security;
revoke all on table public.courier_sync from anon, authenticated;
insert into public.courier_sync (id) values (1) on conflict (id) do nothing;

-- If pg_cron can't be turned on here, the rest still stands (the admin's
-- own "Sync status" still moves the order) and this says so.
do $outer$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise notice 'pg_cron is not available: courier statuses won''t be checked automatically (%).', sqlerrm;
      return;
    end;
  end;

  execute $sql$
    select cron.schedule(
      'courier-sync',
      '*/30 * * * *',
      $job$
        select net.http_post(
          url := 'https://qgvadxivqtlgobfzbdxt.supabase.co/functions/v1/courier',
          body := jsonb_build_object('action', 'sync-all', 'token', (select token from public.courier_sync where id = 1)),
          headers := '{"Content-Type": "application/json"}'::jsonb,
          timeout_milliseconds := 60000
        );
      $job$
    )
  $sql$;
end
$outer$;

-- 2 ---------------------------------------------------------------------------
create table if not exists public.order_courier_events (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(order_id) on delete cascade,
  status text not null,
  at timestamptz not null default now()
);

create index if not exists order_courier_events_order_idx on public.order_courier_events (order_id, at);

-- Read only through track_order and the server side.
alter table public.order_courier_events enable row level security;
revoke all on table public.order_courier_events from anon, authenticated;

-- Where parcels already are: their current status, as the first step.
insert into public.order_courier_events (order_id, status, at)
select o.order_id, o.courier_status, coalesce(o.courier_synced_at, now())
  from public.orders o
 where o.courier_status is not null
   and not exists (select 1 from public.order_courier_events e where e.order_id = o.order_id);

-- After the update, not before: moving stock updates the same order row
-- (stock_taken), which a BEFORE trigger on that row can't do.
create or replace function public.courier_moves_order()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s      text := lower(regexp_replace(coalesce(new.courier_status, ''), '_approval_pending$', '', 'i'));
  o      orders%rowtype;
  target text;
begin
  if s = '' then
    return null;
  end if;

  insert into order_courier_events (order_id, status) values (new.order_id, new.courier_status);

  if s = 'delivered' and new.status in ('pending', 'confirmed', 'processing', 'shipped') then
    target := 'delivered';
  elsif new.status in ('pending', 'confirmed', 'processing')
    and s <> 'unknown'
    and s !~ '(cancel|return|partial)' then
    -- Booked, picked up, in transit, on hold, a failed attempt: the courier
    -- has it — shipped.
    target := 'shipped';
  end if;

  if target is null then
    return null;
  end if;

  select * into o from orders where order_id = new.order_id for update;

  -- Stock, as update_order_status: a checkout order already holds its
  -- pieces; an older or manual order takes them when delivered.
  if o.stock_mode = 'at_order' then
    if not o.stock_taken then perform public.order_stock_move(o.order_id, -1); end if;
  elsif target = 'delivered' and not o.stock_taken then
    perform public.order_stock_move(o.order_id, -1);
  end if;

  update orders set status = target, updated_at = now() where order_id = o.order_id;

  if target = 'delivered' then
    -- The customer's "delivered" email, sent after this commits. The
    -- function checks the key and that the order really is delivered, and
    -- sends it once.
    begin
      perform net.http_post(
        url := 'https://qgvadxivqtlgobfzbdxt.supabase.co/functions/v1/send-status-update',
        body := jsonb_build_object(
          'order_id', o.order_id,
          'status', 'delivered',
          'token', (select token from courier_sync where id = 1)
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    exception when others then
      null;
    end;
  end if;

  return null;
end;
$$;

revoke all on function public.courier_moves_order() from public, anon, authenticated;

drop trigger if exists orders_courier_moves on public.orders;
create trigger orders_courier_moves
  after update of courier_status on public.orders
  for each row
  when (new.courier_status is distinct from old.courier_status)
  execute function public.courier_moves_order();

-- 3 ---------------------------------------------------------------------------
-- As in 20261103130000_security_fixes, plus courier_steps: [{status, at}],
-- oldest first.
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
  created_at timestamptz,
  courier_steps jsonb
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
           o.advance_amount, o.full_name, o.mobile, o.invoice_number, o.tracking_note, o.created_at,
           coalesce((
             select jsonb_agg(jsonb_build_object('status', e.status, 'at', e.at) order by e.at, e.id)
               from order_courier_events e
              where e.order_id = o.order_id
           ), '[]'::jsonb)
      from orders o
     where o.order_id = upper(trim(coalesce(p_order_id, '')))
       and public.normalize_bd_phone(p_mobile) is not null
       and public.normalize_bd_phone(o.mobile) = public.normalize_bd_phone(p_mobile)
     limit 1;
end;
$$;
revoke all on function public.track_order(text, text) from public;
grant execute on function public.track_order(text, text) to anon, authenticated;
