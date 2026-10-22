-- Editorial blocks on the homepage: a big photo with a heading and two lines
-- of text, magazine style, placed between the drop banners (Admin →
-- Homepage). They share home_features with the drop sections so one list
-- sets the order of both.
alter table home_features add column if not exists kind text not null default 'drop';
alter table home_features add column if not exists link text;
alter table home_features add column if not exists link_label text;

do $$ begin
  alter table home_features add constraint home_features_kind_check check (kind in ('drop', 'editorial'));
exception when duplicate_object then null; end $$;
