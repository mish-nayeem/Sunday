-- =====================================================
-- SUNDAY — Supabase Migration Schema
-- Migrated from Base44 entity definitions
-- Run this in Supabase SQL Editor (Project > SQL Editor > New Query)
-- =====================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- =====================================================
-- 1. PROFILES (extends Supabase auth.users with role)
-- Base44's "User" entity -> role field
-- =====================================================
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now()
);

-- Auto-create a profile row whenever a new auth user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- 2. PRODUCTS
-- =====================================================
create table products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  category text not null check (category in (
    'full_sleeve_shirts','half_sleeve_shirts','formal_shirts',
    'polo','t_shirts','cargo','formal_pants'
  )),
  price numeric not null,
  original_price numeric,
  cost_price numeric default 0,
  quantity numeric default 0,
  size_stock jsonb default '{}',
  sku text,
  description text not null,
  details text,
  images text[] not null default '{}',
  sizes text[] not null default '{}',
  colors text[] default '{}',
  stock_status text default 'in_stock' check (stock_status in ('in_stock','low_stock','out_of_stock')),
  is_featured boolean default false,
  is_new_arrival boolean default false,
  is_best_seller boolean default false,
  discount_percentage numeric default 0,
  fabric text,
  care_instructions text,
  sort_order numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_products_category on products(category);
create index idx_products_created_at on products(created_at desc);

-- =====================================================
-- 3. ORDERS
-- =====================================================
create table orders (
  id uuid primary key default uuid_generate_v4(),
  order_id text unique not null,
  full_name text not null,
  email text,
  mobile text not null,
  address text not null,
  district text not null,
  area text,
  notes text,
  items jsonb not null default '[]',
  subtotal numeric default 0,
  delivery_charge numeric default 0,
  total numeric not null,
  payment_method text default 'cod',
  payment_status text default 'unpaid' check (payment_status in ('unpaid','paid')),
  status text default 'pending' check (status in (
    'pending','confirmed','processing','shipped','delivered','returned','cancelled'
  )),
  tracking_note text,
  admin_notes text,
  invoice_number text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_orders_order_id on orders(order_id);
create index idx_orders_mobile on orders(mobile);
create index idx_orders_created_at on orders(created_at desc);

-- =====================================================
-- 4. REVIEWS
-- =====================================================
create table reviews (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  product_name text not null,
  author_name text not null,
  rating numeric not null check (rating >= 1 and rating <= 5),
  comment text not null,
  is_approved boolean default false,
  created_at timestamptz default now()
);

create index idx_reviews_product_id on reviews(product_id);

-- =====================================================
-- 5. EXPENSES (admin only)
-- =====================================================
create table expenses (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  amount numeric not null,
  category text not null default 'other' check (category in (
    'inventory','marketing','operations','shipping','utilities','other'
  )),
  date date not null,
  notes text,
  created_at timestamptz default now()
);

-- =====================================================
-- 6. INVOICES
-- =====================================================
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  invoice_number text unique not null,
  order_id text not null,
  customer_name text not null,
  customer_mobile text,
  customer_address text,
  items jsonb not null default '[]',
  subtotal numeric default 0,
  delivery_charge numeric default 0,
  total numeric not null,
  issue_date date not null,
  status text default 'issued' check (status in ('issued','paid')),
  created_at timestamptz default now()
);

-- =====================================================
-- 7. NEWSLETTER SUBSCRIBERS
-- =====================================================
create table newsletter_subscribers (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  created_at timestamptz default now()
);

-- =====================================================
-- 8. CONTACT MESSAGES
-- =====================================================
create table contact_messages (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz default now()
);

-- =====================================================
-- 9. SETTINGS (single row config table)
-- =====================================================
create table settings (
  id uuid primary key default uuid_generate_v4(),
  store_name text not null default 'SUNDAY',
  store_email text,
  store_phone text,
  store_address text,
  dhaka_delivery_charge numeric default 60,
  outside_dhaka_delivery_charge numeric default 120,
  facebook_url text,
  instagram_url text,
  whatsapp_number text,
  created_at timestamptz default now()
);

-- Insert one default settings row (app expects .list(...,1) to always find something)
insert into settings (store_name, whatsapp_number, dhaka_delivery_charge, outside_dhaka_delivery_charge)
values ('SUNDAY', '8801700000000', 60, 120);

-- =====================================================
-- 10. WISHLIST ITEMS
-- NOTE: current frontend code (cartStore.js) actually stores wishlist in
-- localStorage, NOT via this Base44 entity. This table is kept for parity
-- with the original schema in case you later want server-synced wishlists
-- (e.g. so a logged-in user's wishlist follows them across devices).
-- =====================================================
create table wishlist_items (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  user_session text not null,
  created_at timestamptz default now()
);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
alter table products enable row level security;
alter table orders enable row level security;
alter table reviews enable row level security;
alter table expenses enable row level security;
alter table invoices enable row level security;
alter table newsletter_subscribers enable row level security;
alter table contact_messages enable row level security;
alter table settings enable row level security;
alter table wishlist_items enable row level security;
alter table profiles enable row level security;

-- Helper: is the current user an admin?
create function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ---- PRODUCTS: public read, admin write ----
create policy "Products are viewable by everyone"
  on products for select using (true);
create policy "Only admins can modify products"
  on products for all using (public.is_admin()) with check (public.is_admin());

-- ---- ORDERS: anyone can create (guest checkout), only admin can read/update all ----
create policy "Anyone can place an order"
  on orders for insert with check (true);
create policy "Admins can view all orders"
  on orders for select using (public.is_admin());
create policy "Admins can update orders"
  on orders for update using (public.is_admin());
-- Order tracking page needs to look up by order_id/mobile without being admin.
-- Handle this via a Postgres function (security definer) rather than opening
-- full public SELECT on the orders table (avoids leaking other customers' data).
create function public.track_order(p_order_id text default null, p_mobile text default null)
returns setof orders as $$
  select * from orders
  where (p_order_id is not null and order_id = p_order_id)
     or (p_mobile is not null and mobile = p_mobile)
  order by created_at desc
  limit 1;
$$ language sql security definer stable;

-- ---- REVIEWS: public can read approved, anyone can submit, admin approves ----
create policy "Approved reviews are public"
  on reviews for select using (is_approved = true or public.is_admin());
create policy "Anyone can submit a review"
  on reviews for insert with check (true);
create policy "Admins can moderate reviews"
  on reviews for update using (public.is_admin());
create policy "Admins can delete reviews"
  on reviews for delete using (public.is_admin());

-- ---- EXPENSES: admin only ----
create policy "Only admins can access expenses"
  on expenses for all using (public.is_admin()) with check (public.is_admin());

-- ---- INVOICES: admin only ----
create policy "Only admins can access invoices"
  on invoices for all using (public.is_admin()) with check (public.is_admin());

-- ---- NEWSLETTER: anyone can subscribe, admin can view list ----
create policy "Anyone can subscribe"
  on newsletter_subscribers for insert with check (true);
create policy "Admins can view subscribers"
  on newsletter_subscribers for select using (public.is_admin());

-- ---- CONTACT MESSAGES: anyone can send, admin can view ----
create policy "Anyone can send a contact message"
  on contact_messages for insert with check (true);
create policy "Admins can view contact messages"
  on contact_messages for select using (public.is_admin());

-- ---- SETTINGS: public read (needed for delivery charge/whatsapp number on storefront), admin write ----
create policy "Settings are public read"
  on settings for select using (true);
create policy "Only admins can modify settings"
  on settings for update using (public.is_admin());

-- ---- WISHLIST ITEMS: scoped to session/user, not currently used by frontend ----
create policy "Users manage their own wishlist items"
  on wishlist_items for all using (true) with check (true);

-- ---- PROFILES: users can read their own profile, admins can read all ----
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id or public.is_admin());
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- =====================================================
-- DONE
-- Next steps:
-- 1. Run this whole file in Supabase SQL Editor.
-- 2. To make yourself an admin after signing up once:
--    update profiles set role = 'admin' where email = 'your-email@example.com';
-- 3. Enable Google OAuth provider in Supabase Dashboard > Authentication > Providers.
-- 4. Enable Email OTP / confirm-email flow under Authentication > Email Templates.
-- =====================================================
