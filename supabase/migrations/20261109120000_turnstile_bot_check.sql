-- Bot check (Cloudflare Turnstile) for checkout and the support portal.
--
-- Off until the admin turns it on (Orders → Security → Bot check), so this
-- changes nothing by itself. Once on:
--   1. the page shows Cloudflare's check (usually invisible) and sends its
--      token to the turnstile-check edge function;
--   2. that asks Cloudflare whether the token is real and, if so, writes a
--      pass here — good for 10 minutes and 10 uses;
--   3. the page places the order / looks up the order through the
--      *_checked functions below with that pass. Without a good pass, they
--      refuse (BOT_CHECK); the plain create_order and support functions
--      refuse too, since the pass is checked where the work is done.
-- The admin's own orders (place_order) and anything run outside the API
-- (migrations, the service role) are never asked.

create table if not exists public.turnstile_passes (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  uses       int not null default 0
);
alter table public.turnstile_passes enable row level security;
revoke all on table public.turnstile_passes from anon, authenticated;

-- Is the bot check on? site_settings 'turnstile' = { site_key, enforce }.
create or replace function public.bot_check_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce((value ->> 'enforce')::boolean, false) and coalesce(value ->> 'site_key', '') <> ''
      from site_settings where key = 'turnstile'
  ), false)
$$;
revoke all on function public.bot_check_on() from public;
grant execute on function public.bot_check_on() to anon, authenticated;

-- Spend one use of a pass. True when it was good (and now counts one more).
create or replace function public.use_bot_pass(p_pass text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  hit uuid;
begin
  delete from turnstile_passes where created_at < now() - interval '1 day';
  if coalesce(p_pass, '') !~ '^[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  update turnstile_passes
     set uses = uses + 1
   where id = p_pass::uuid
     and created_at > now() - interval '10 minutes'
     and uses < 10
  returning id into hit;
  return hit is not null;
end;
$$;
revoke all on function public.use_bot_pass(text) from public, anon, authenticated;

-- This request came from a page that passed the check (set by the
-- *_checked functions for the rest of this one request), or isn't from a
-- shopper at all.
create or replace function public.bot_check_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.bot_check_on()
      or public.is_admin()
      or current_setting('request.headers', true) is null
      or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
      or coalesce(current_setting('sunday.human', true), '') = '1'
$$;
revoke all on function public.bot_check_ok() from public, anon, authenticated;

-- Checkout ----------------------------------------------------------------
-- Every shop order goes into orders through create_order; this stops one
-- that didn't come through the check (while it's on).
create or replace function public.orders_bot_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.bot_check_ok() then
    raise exception 'BOT_CHECK';
  end if;
  return new;
end;
$$;
revoke all on function public.orders_bot_check() from public, anon, authenticated;

drop trigger if exists orders_bot_check on public.orders;
create trigger orders_bot_check
  before insert on public.orders
  for each row execute function public.orders_bot_check();

create or replace function public.create_order_checked(
  p_turnstile text,
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
set search_path = public
as $$
begin
  if public.bot_check_on() and not public.use_bot_pass(p_turnstile) then
    raise exception 'BOT_CHECK';
  end if;
  perform set_config('sunday.human', '1', true);
  return query select * from public.create_order(
    p_full_name, p_email, p_mobile, p_address, p_district, p_area, p_notes, p_items,
    p_payment_method, p_bkash_transaction_id, p_coupon_code, p_utm_source, p_utm_medium, p_utm_campaign
  );
end;
$$;
revoke all on function public.create_order_checked(text, text, text, text, text, text, text, text, jsonb, text, text, text, text, text, text) from public;
grant execute on function public.create_order_checked(text, text, text, text, text, text, text, text, jsonb, text, text, text, text, text, text) to anon, authenticated;

-- Support portal ------------------------------------------------------------
-- support_gate (20261108120000) also turns away a lookup that didn't come
-- through the check.
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
  elsif not public.bot_check_ok() then
    why := 'bot_check';
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

create or replace function public.support_find_order_checked(p_turnstile text, p_order_id text, p_contact text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.bot_check_on() and not public.use_bot_pass(p_turnstile) then
    return jsonb_build_object('error', 'BOT_CHECK');
  end if;
  perform set_config('sunday.human', '1', true);
  return public.support_find_order(p_order_id, p_contact);
end;
$$;
revoke all on function public.support_find_order_checked(text, text, text) from public;
grant execute on function public.support_find_order_checked(text, text, text) to anon, authenticated;

create or replace function public.support_request_return_checked(
  p_turnstile text, p_order_id text, p_contact text, p_kind text, p_reason text, p_items jsonb, p_details text,
  p_refund_to text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.bot_check_on() and not public.use_bot_pass(p_turnstile) then
    return jsonb_build_object('error', 'Please tick the "not a robot" check and try again.');
  end if;
  perform set_config('sunday.human', '1', true);
  return public.support_request_return(p_order_id, p_contact, p_kind, p_reason, p_items, p_details, p_refund_to);
end;
$$;
revoke all on function public.support_request_return_checked(text, text, text, text, text, jsonb, text, text) from public;
grant execute on function public.support_request_return_checked(text, text, text, text, text, jsonb, text, text) to anon, authenticated;
