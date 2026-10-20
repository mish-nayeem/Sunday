-- The side menu (☰): SHOP and EXPLORE tabs, edited in Admin → Side menu.
-- Rows stay in nav_categories: menu 'shop' = the SHOP tab, menu 'drops' =
-- the EXPLORE tab. `link` is where a row goes; empty means the old rule
-- (SHOP → that category, EXPLORE → that drop's products).

alter table nav_categories add column if not exists link text;

-- Signed-in customers read the menu too (the old policy was for anon only,
-- so a logged-in shopper fell back to the default menu).
drop policy if exists "Anyone can read the visible shop menu" on nav_categories;
create policy "Anyone can read the visible shop menu"
  on nav_categories for select to anon, authenticated using (active = true or public.is_admin());

grant select on nav_categories to anon, authenticated;
