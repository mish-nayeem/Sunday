-- Where a visit came from, on every page view it makes: the tracked link it
-- arrived through (?utm_…), a share link (?s=whatsapp …), or the app whose
-- browser it opened in (Instagram, Messenger, Facebook). Empty for a plain
-- visit. Orders already carry the same fields.
alter table public.page_views add column if not exists utm_source text;
alter table public.page_views add column if not exists utm_medium text;
alter table public.page_views add column if not exists utm_campaign text;

create index if not exists page_views_utm_idx
  on public.page_views (utm_source, created_at)
  where utm_source is not null;
