-- ===========================================================================
-- One admin: sundayclothin@gmail.com
-- ===========================================================================
-- Sign-in is by emailed one-time code now (no passwords), and exactly one
-- address is the admin. public.is_admin() — behind every admin RLS policy,
-- the admin panel's functions and its edge functions — checks the signed-in
-- email instead of profiles.role. Before, any user could update their own
-- profile row, role included, and so make themselves an admin.
--
-- profiles.role is kept in step for anything that still reads it, and can
-- no longer be changed by hand.
--
-- The same address is in src/lib/adminEmail.js and
-- supabase/functions/_shared/admin.ts — change all three together.

begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(lower(auth.jwt() ->> 'email') = 'sundayclothin@gmail.com', false)
$$;

-- profiles.role follows the email, on every insert and update.
create or replace function public.sunday_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.role := case when lower(coalesce(new.email, '')) = 'sundayclothin@gmail.com' then 'admin' else 'user' end;
  return new;
end;
$$;

drop trigger if exists profiles_role_follows_email on profiles;
create trigger profiles_role_follows_email
  before insert or update on profiles
  for each row execute function public.sunday_profile_role();

-- Existing rows: the trigger above sets the role from the email.
update profiles set role = role;

commit;
