-- More things that can't be undone, each behind the code emailed to the
-- admin (edge function admin-code, admin_check_code — 20261115120000), as on
-- PAUSE:
--   * Orders → Select → Delete: test orders removed for good.
--   * Analytics → Start fresh: every page view so far deleted.
--   * Analytics → Clean up: page views older than N days deleted.
-- A wrong / missing / spent code comes back as { error: CODE_* } (not
-- raised), so wrong tries stay counted.

-- Deleting orders: what they took from stock goes back first (only while
-- it's off the shelf — orders.stock_taken — less anything a return already
-- put back), then the order and what hangs off it.
create or replace function public.admin_delete_orders(p_ids text[], p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  n integer := 0;
  bad text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return jsonb_build_object('deleted', 0);
  end if;
  bad := public.admin_check_code('delete_orders', p_code);
  if bad is not null then
    return jsonb_build_object('error', bad);
  end if;

  for o in select order_id, stock_taken from orders where order_id = any(p_ids) for update loop
    if o.stock_taken then
      perform public.order_stock_move(o.order_id, 1);
    end if;
    n := n + 1;
  end loop;

  update abandoned_carts set converted_order_id = null where converted_order_id = any(p_ids);
  delete from push_sent where order_id = any(p_ids);
  delete from orders where order_id = any(p_ids);
  return jsonb_build_object('deleted', n);
end;
$$;
revoke all on function public.admin_delete_orders(text[], text) from public, anon;
grant execute on function public.admin_delete_orders(text[], text) to authenticated;

-- Start fresh: every visit so far. Orders stay.
create or replace function public.admin_reset_analytics(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  bad text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  bad := public.admin_check_code('reset_analytics', p_code);
  if bad is not null then
    return jsonb_build_object('error', bad);
  end if;
  delete from page_views where true;
  get diagnostics n = row_count;
  insert into site_settings (key, value, updated_at)
  values ('analytics_since', to_jsonb(now()), now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  return jsonb_build_object('cleared', n);
end;
$$;
revoke all on function public.admin_reset_analytics(text) from public, anon;
grant execute on function public.admin_reset_analytics(text) to authenticated;

-- How many page views are older than p_days (for the Clean up line).
create or replace function public.admin_old_page_views(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  return jsonb_build_object('older', (select count(*) from page_views where created_at < now() - make_interval(days => greatest(p_days, 90))));
end;
$$;
revoke all on function public.admin_old_page_views(integer) from public, anon;
grant execute on function public.admin_old_page_views(integer) to authenticated;

-- Clean up: page views older than p_days (never under 90 — the longest
-- range Analytics shows).
create or replace function public.admin_trim_page_views(p_code text, p_days integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  bad text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  bad := public.admin_check_code('trim_analytics', p_code);
  if bad is not null then
    return jsonb_build_object('error', bad);
  end if;
  delete from page_views where created_at < now() - make_interval(days => greatest(p_days, 90));
  get diagnostics n = row_count;
  return jsonb_build_object('deleted', n);
end;
$$;
revoke all on function public.admin_trim_page_views(text, integer) from public, anon;
grant execute on function public.admin_trim_page_views(text, integer) to authenticated;
