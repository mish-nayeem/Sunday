-- Hide a product, or a whole collection, without deleting it (the 👁 in
-- Admin → Products → Product catalog and → Collections), as on Pause.
--
-- Hidden means hidden for shoppers everywhere, not just off a list. The rows
-- can't be read at all (RLS), so a hidden product is gone from:
--   * the shop, the product page and search;
--   * the menus, the sitemap and share previews.
-- It can't be ordered either. The admin still sees and edits everything,
-- and can enter a DM order for it.

-- A product -------------------------------------------------------------------
alter table public.products add column if not exists hidden boolean not null default false;

-- A collection ----------------------------------------------------------------
-- Collections are products.drop_name, so a hidden one is a name kept here,
-- matched the way the site matches drop names (case and spaces don't count).
create table if not exists public.hidden_collections (
  name text primary key,
  created_at timestamptz not null default now()
);

alter table public.hidden_collections enable row level security;
revoke all on table public.hidden_collections from anon;
grant select, insert, update, delete on table public.hidden_collections to authenticated;

drop policy if exists "Admin manages hidden collections" on public.hidden_collections;
create policy "Admin manages hidden collections"
  on public.hidden_collections for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.drop_key(p text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'))
$$;

-- Asked by the products policy for shoppers, who can't read the table
-- itself — so it runs as its owner.
create or replace function public.collection_hidden(p_drop text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_drop is not null
     and exists (select 1 from hidden_collections h where public.drop_key(h.name) = public.drop_key(p_drop))
$$;

revoke all on function public.collection_hidden(text) from public;
grant execute on function public.collection_hidden(text) to anon, authenticated;

-- Who sees which product (the launch time rule as before) --------------------
drop policy if exists "Anyone can view products" on public.products;
create policy "Anyone can view products"
  on public.products for select
  to anon, authenticated
  using (
    public.is_admin()
    or (
      (publish_at is null or publish_at <= now())
      and not hidden
      and not public.collection_hidden(drop_name)
    )
  );

-- Ordering --------------------------------------------------------------------
-- create_order reads products as its owner, past RLS; this stops an order
-- that carries a hidden product, the same way it stops one that isn't
-- launched yet. The admin's own (DM) orders still go through. SUNDAY keeps
-- an order's lines in orders.items.
create or replace function public.order_items_not_hidden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if public.is_admin() then
    return new;
  end if;
  select p.name into v_name
    from jsonb_array_elements(case when jsonb_typeof(new.items) = 'array' then new.items else '[]'::jsonb end) x
    join products p on p.id::text = coalesce(x ->> 'product_id', x ->> 'productId')
   where p.hidden or public.collection_hidden(p.drop_name)
   limit 1;
  if v_name is not null then
    raise exception 'UNAVAILABLE:%', v_name;
  end if;
  return new;
end;
$$;

revoke all on function public.order_items_not_hidden() from public, anon, authenticated;

drop trigger if exists orders_items_not_hidden on public.orders;
create trigger orders_items_not_hidden
  before insert on public.orders
  for each row execute function public.order_items_not_hidden();
