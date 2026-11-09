-- Overview → Free plan box: how full the database and the photo storage
-- are, measured here (no Supabase token needed). Admin only.
--   db_bytes       the whole database, as Supabase counts it for the plan
--   storage_bytes  every file in Storage, all buckets
--   buckets        per bucket: files and bytes
--   tables         the five biggest tables (what fills the database)

create or replace function public.admin_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  out jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum(coalesce((o.metadata ->> 'size')::bigint, 0)) from storage.objects o), 0),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', b.bucket_id, 'files', b.files, 'bytes', b.bytes) order by b.bytes desc)
        from (
          select o.bucket_id, count(*) as files, sum(coalesce((o.metadata ->> 'size')::bigint, 0)) as bytes
            from storage.objects o group by o.bucket_id
        ) b
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('table', t.relname, 'bytes', t.bytes) order by t.bytes desc)
        from (
          select c.relname, pg_total_relation_size(c.oid) as bytes
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'
           order by pg_total_relation_size(c.oid) desc
           limit 5
        ) t
    ), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;
revoke all on function public.admin_usage() from public, anon;
grant execute on function public.admin_usage() to authenticated;
