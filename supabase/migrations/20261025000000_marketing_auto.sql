-- Marketing, filled in by itself (ported from PAUSE), and drop costs.
--
--   meta_ad_daily    — Facebook / Instagram ad spend per day and campaign,
--                      pulled from Meta by the `marketing` edge function.
--   email_campaigns  — now also the campaigns sent from the admin through
--                      Brevo, with their numbers pulled back.
--   social_stats     — now also a daily Instagram / Facebook follower count
--                      pulled from Meta (source 'meta'); typed rows stay.
--   drop_costs       — costs typed in by hand per drop (ads / other), for
--                      Analytics → Investor report and drop profit.

create table if not exists meta_ad_daily (
  day            date not null,
  platform       text not null,          -- facebook | instagram | other
  campaign_name  text not null default '',
  spend          numeric not null default 0,
  impressions    bigint not null default 0,
  clicks         bigint not null default 0,
  synced_at      timestamptz not null default now(),
  primary key (day, platform, campaign_name)
);

alter table meta_ad_daily enable row level security;
drop policy if exists "Admins read Meta ad spend" on meta_ad_daily;
create policy "Admins read Meta ad spend"
  on meta_ad_daily for select
  to authenticated
  using (public.is_admin());

alter table email_campaigns add column if not exists brevo_id bigint;
alter table email_campaigns add column if not exists subject text;
alter table email_campaigns add column if not exists audience text;
alter table email_campaigns add column if not exists recipients int;
alter table email_campaigns add column if not exists status text;          -- typed | sent
alter table email_campaigns add column if not exists sent_at timestamptz;
alter table email_campaigns add column if not exists delivered int;
alter table email_campaigns add column if not exists opens int;
alter table email_campaigns add column if not exists clicks int;
alter table email_campaigns add column if not exists unsubscribes int;
alter table email_campaigns add column if not exists stats_at timestamptz;

alter table social_stats add column if not exists source text not null default 'manual';
alter table social_stats add column if not exists captured_on date;
alter table social_stats add column if not exists media_count int;
create unique index if not exists social_stats_daily_idx
  on social_stats (platform, captured_on) where source = 'meta';

create table if not exists drop_costs (
  id          bigint generated always as identity primary key,
  drop_name   text not null,
  kind        text not null check (kind in ('ads', 'other')),
  label       text,
  amount      numeric not null check (amount >= 0),
  spent_on    date not null default current_date,
  created_at  timestamptz not null default now()
);

create index if not exists drop_costs_drop_idx on drop_costs (lower(drop_name), spent_on);

alter table drop_costs enable row level security;
drop policy if exists "Admins manage drop costs" on drop_costs;
create policy "Admins manage drop costs"
  on drop_costs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
