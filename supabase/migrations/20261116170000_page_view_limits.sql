-- Visit counting (page_views): limits and bots out (audit MEDIUM-4), as on
-- PAUSE. Nothing here deletes anything; Analytics → Clean up (#48) does
-- that, with a code from the admin's email.
--
-- Until now anyone could add page views without any limit, of any size: a
-- script could fill the database and make Analytics meaningless.
--
-- 1. Size: each field of a page view has a sensible most. NOT VALID — the
--    rows already there aren't checked, only new ones.
-- 2. Rate: 300 page views an hour from one address (several shoppers on one
--    mobile network share one; a real one sees 30–60). Past it the visit
--    just isn't counted — the shop works the same.
-- 3. Bots: a visit whose browser says it's a crawler, a headless browser or
--    a link previewer isn't counted (Google and Facebook still see the site;
--    they just don't show up as visitors).

-- 1. Size ---------------------------------------------------------------------
alter table public.page_views
  drop constraint if exists page_views_sizes_ok;
alter table public.page_views
  add constraint page_views_sizes_ok check (
    length(session_id) <= 64
    and length(path) <= 300
    and coalesce(length(referrer), 0) <= 500
    and coalesce(length(device), 0) <= 20
    and coalesce(length(utm_source), 0) <= 100
    and coalesce(length(utm_medium), 0) <= 100
    and coalesce(length(utm_campaign), 0) <= 100
  ) not valid;

-- 3. Bots ---------------------------------------------------------------------
-- The browser of the request the database is answering (PostgREST passes
-- the request's headers in).
create or replace function public.request_is_bot()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (current_setting('request.headers', true)::json ->> 'user-agent')
      ~* '(bot|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|meta-externalagent|whatsapp|telegram|preview|monitor|uptime|curl|wget|python-requests|httpclient|go-http|axios)',
    false
  )
$$;

-- 2 + 3. Who may log a page view ---------------------------------------------
drop policy if exists "Anyone can log a page view" on public.page_views;
create policy "Anyone can log a page view"
  on public.page_views for insert
  to anon, authenticated
  with check (
    not public.request_is_bot()
    and public.rate_limit_ok('page_view', 300, 3600)
  );

drop trigger if exists page_views_rate_limit_hit on public.page_views;
create trigger page_views_rate_limit_hit
  after insert on public.page_views
  for each row execute function public.record_rate_limit_hit('page_view', '3600');
