-- public.wishlist_items had one policy, "Users manage their own wishlist
-- items", that said yes to everything (using true, with check true) for
-- anyone, signed in or not — so any visitor could read every row, change
-- them or delete them. Nothing in the site or the admin uses this table
-- (the saved-items page keeps its list in the browser; restock requests are
-- public.wishlist), so it's closed to the browser altogether. The rows stay.

drop policy if exists "Users manage their own wishlist items" on public.wishlist_items;
revoke all on table public.wishlist_items from anon, authenticated;

drop policy if exists "Signed-in admins manage wishlist items" on public.wishlist_items;
create policy "Signed-in admins manage wishlist items"
  on public.wishlist_items for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
grant select, insert, update, delete on table public.wishlist_items to authenticated;
