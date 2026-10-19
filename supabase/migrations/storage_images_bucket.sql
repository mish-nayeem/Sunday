-- ===========================================================================
-- Run once in: Supabase Dashboard → SQL Editor → New query
-- ===========================================================================
-- Product photo storage (replaces Cloudinary): a public `images` bucket.
-- Anyone can view a photo by its URL; only an admin can add, replace or
-- remove one. Requires public.is_admin() from sunday_supabase_schema.sql.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'images',
  'images',
  true,
  10485760, -- 10 MB per file; uploads are compressed in the browser first
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- No SELECT policy for visitors: a public bucket serves files by URL without
-- one, and leaving it out stops anyone listing the whole bucket.
drop policy if exists "Admin reads images" on storage.objects;
create policy "Admin reads images"
  on storage.objects for select to authenticated
  using (bucket_id = 'images' and public.is_admin());

drop policy if exists "Admin uploads images" on storage.objects;
create policy "Admin uploads images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.is_admin());

drop policy if exists "Admin replaces images" on storage.objects;
create policy "Admin replaces images"
  on storage.objects for update to authenticated
  using (bucket_id = 'images' and public.is_admin())
  with check (bucket_id = 'images' and public.is_admin());

drop policy if exists "Admin deletes images" on storage.objects;
create policy "Admin deletes images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.is_admin());

commit;
