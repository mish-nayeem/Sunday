-- Overview → Usage → "Unused photos": files in the images bucket that no row
-- anywhere points to any more (a deleted product's photos, a replaced hero
-- slide, a re-uploaded picture). Admin only. Nothing is deleted here — the
-- admin page removes the files it gets back through Storage itself.
--
-- A file counts as used when its name (without the extension, so photo.jpg
-- and its link-preview copy photo.share.jpg go together) appears anywhere in
-- any row of any table — products, hero slides, lookbook, site settings, and
-- orders/invoices too, so a photo an old order shows is kept. Pure logs are
-- skipped. When in doubt it keeps the file.
--
--   p_names    only check these object names (used right after a delete);
--              null = check the whole bucket
--   p_min_age  with p_names null, skip files newer than this — a photo
--              uploaded into a form that isn't saved yet isn't in a row yet

create or replace function public.admin_storage_unused(p_names text[] default null, p_min_age interval default interval '1 day')
returns table (name text, bytes bigint, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  t record;
  part text;
  blob text := '';
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and c.relname not in ('page_views', 'rate_limit_hits', 'blocked_attempts', 'turnstile_passes',
                             'push_sent', 'courier_sync', 'order_courier_events', 'admin_notice_state')
  loop
    execute format('select string_agg(x::text, '' '') from %I x', t.relname) into part;
    blob := blob || ' ' || coalesce(part, '');
  end loop;

  return query
    select o.name, coalesce((o.metadata ->> 'size')::bigint, 0), o.created_at
      from storage.objects o
     where o.bucket_id = 'images'
       and o.name not like '%.emptyFolderPlaceholder'
       and o.name not like 'og/%'
       and (case when p_names is null then o.created_at < now() - p_min_age else o.name = any(p_names) end)
       and position(regexp_replace(regexp_replace(o.name, '^.*/', ''), '(\.share)?\.[^.]+$', '') in blob) = 0
       and position(replace(regexp_replace(regexp_replace(o.name, '^.*/', ''), '(\.share)?\.[^.]+$', ''), ' ', '%20') in blob) = 0
     order by o.created_at;
end;
$$;
revoke all on function public.admin_storage_unused(text[], interval) from public, anon;
grant execute on function public.admin_storage_unused(text[], interval) to authenticated;
