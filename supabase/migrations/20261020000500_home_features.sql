-- Drop sections on the homepage, under the main hero (Admin → Homepage →
-- Drop sections). Each one: a wide photo with the drop's name, a line of
-- text and a Shop now button (→ /shop?drop=…), then a row of picked photos.
-- pics: [{ "url": "...", "product_id": "<uuid or null>", "focus": "top" }]

create table if not exists home_features (
  id             bigint generated always as identity primary key,
  drop_name      text not null,
  title          text not null default '',
  blurb          text not null default '',
  image_url      text,
  mobile_image_url text,
  focus          text,
  show_lookbook  boolean not null default false,
  pics           jsonb not null default '[]'::jsonb,
  sort_order     int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz default now()
);

alter table home_features enable row level security;

drop policy if exists "Anyone reads visible home features" on home_features;
create policy "Anyone reads visible home features"
  on home_features for select to anon, authenticated using (active or public.is_admin());

drop policy if exists "Signed-in admins manage home features" on home_features;
create policy "Signed-in admins manage home features"
  on home_features for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on home_features to anon, authenticated;
grant insert, update, delete on home_features to authenticated;

-- A demo section for the demo drop, so the homepage shows the layout before
-- a real drop is set up. Remove it with:
--   delete from home_features where drop_name = 'DEMO DROP 01';
insert into home_features (drop_name, title, blurb, image_url, focus, show_lookbook, pics, sort_order)
select 'DEMO DROP 01', 'Demo Drop 01',
       'Oxford shirts, linen camp collars and pleated trousers for warm days and long weeks.',
       '/demo/look-2.jpg', 'top', true,
       '[{"url":"/demo/look-1.jpg","product_id":"d0000000-0000-4000-8000-000000000002"},
         {"url":"/demo/look-3.jpg","product_id":"d0000000-0000-4000-8000-000000000003"},
         {"url":"/demo/oxford-white-1.jpg","product_id":"d0000000-0000-4000-8000-000000000001"},
         {"url":"/demo/camp-rust-1.jpg","product_id":null}]'::jsonb,
       0
where not exists (select 1 from home_features where drop_name = 'DEMO DROP 01')
  and exists (select 1 from products where id = 'd0000000-0000-4000-8000-000000000001');
