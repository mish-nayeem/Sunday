-- ✥ Adjust (Admin → Products → a product → Images): where each photo sits
-- in its card, and how far it's zoomed — { "<photo url>": "x% y% zoom" }.
-- A photo with no entry shows centred, as before.
alter table public.products
  add column if not exists image_focus jsonb not null default '{}'::jsonb;
