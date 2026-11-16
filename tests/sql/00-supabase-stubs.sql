-- Just enough of Supabase for this repo's migrations to run on a plain
-- Postgres (CI's postgres service, or a local one): the roles, auth's
-- helpers that read the request's JWT claims, and do-nothing stand-ins for
-- pg_cron, pg_net and Storage. Only for tests — never run against the live
-- database.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- auth: the signed-in user is whatever request.jwt.claims says (set it in a
-- test with: set request.jwt.claims = '{"email":"...","sub":"..."}').
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default extensions.uuid_generate_v4(),
  email text,
  raw_user_meta_data jsonb default '{}',
  created_at timestamptz default now()
);
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon')
$$;
grant usage on schema auth, extensions to anon, authenticated, service_role;

-- Storage: only read (the admin's usage box).
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (
  id uuid primary key default extensions.uuid_generate_v4(),
  bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now()
);

-- pg_cron and pg_net: accept the calls, do nothing.
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
  language sql as $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) returning jobid $$;
create or replace function cron.unschedule(job_name text) returns boolean
  language sql as $$ delete from cron.job where jobname = job_name returning true $$;
create schema if not exists net;
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language sql as $$ select 1::bigint $$;
create or replace function public.http_post_stub() returns void language sql as $$ select $$;

create schema if not exists vault;

-- Realtime's publication (tables are added to it by the migrations).
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
