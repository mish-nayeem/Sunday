-- Two admin clean-ups from PAUSE, before launch:
--   * Orders → Abandoned cart → Clear all — with a six-digit code emailed to
--     the admin first (edge function admin-code), since it can't be undone.
--   * Customers → Accounts → Delete account — test accounts, or someone who
--     asks to be forgotten.
--
-- The code: admin-code stores only its SHA-256 in admin_action_codes; it
-- works for its own action, for 10 minutes, once, and not after five wrong
-- tries. Wrong tries come back as { error: CODE_* } instead of raising, so
-- the count is kept.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_action_codes (
  id bigint generated always as identity primary key,
  action text not null,
  code_hash text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists admin_action_codes_action_idx on public.admin_action_codes (action, created_at desc);

-- Only the server side (service role) touches it: RLS on, no policies, no grants.
alter table public.admin_action_codes enable row level security;
revoke all on table public.admin_action_codes from anon, authenticated;

-- Checks and spends a code. Null when it's good (and marks it used), or
-- what's wrong. Never raises. Not granted to anyone — only the functions
-- below call it.
create or replace function public.admin_check_code(p_action text, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.admin_action_codes%rowtype;
begin
  select * into c from public.admin_action_codes
   where action = p_action and used_at is null and expires_at > now()
   order by created_at desc limit 1
   for update;
  if not found then
    return 'CODE_NEEDED';
  end if;
  if c.attempts >= 5 then
    return 'CODE_LOCKED';
  end if;
  if encode(extensions.digest(trim(coalesce(p_code, '')), 'sha256'), 'hex') <> c.code_hash then
    update public.admin_action_codes set attempts = attempts + 1 where id = c.id;
    return 'CODE_WRONG';
  end if;
  update public.admin_action_codes set used_at = now() where id = c.id;
  return null;
end;
$$;
revoke all on function public.admin_check_code(text, text) from public, anon, authenticated;

-- Clear all: only the carts on the list (never turned into an order). The
-- ones that did stay, for the checkout numbers.
create or replace function public.admin_clear_abandoned_carts(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  bad text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  bad := public.admin_check_code('clear_abandoned', p_code);
  if bad is not null then
    return jsonb_build_object('error', bad);
  end if;
  delete from public.abandoned_carts where converted_order_id is null;
  get diagnostics n = row_count;
  return jsonb_build_object('cleared', n);
end;
$$;
revoke all on function public.admin_clear_abandoned_carts(text) from public, anon;
grant execute on function public.admin_clear_abandoned_carts(text) to authenticated;

-- Delete account: the sign-in (auth.users) and its profile (cascades).
-- Their orders stay — the shop's records, matched by email — and so does
-- their mailing-list entry. Never the admin's own account.
create or replace function public.admin_delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  select lower(email) into target from auth.users where id = p_user_id;
  if not found then
    return;
  end if;
  if p_user_id = auth.uid() or target = lower(coalesce(auth.jwt() ->> 'email', '')) or target = 'sundayclothin@gmail.com' then
    raise exception 'NOT_YOURSELF';
  end if;
  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;
revoke all on function public.admin_delete_account(uuid) from public, anon;
grant execute on function public.admin_delete_account(uuid) to authenticated;
