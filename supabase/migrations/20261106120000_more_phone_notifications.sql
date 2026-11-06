-- Phone notifications beyond "New order" (supabase/functions/notify):
--
--   • a customer's exchange / refund request from the Support page
--   • parcel news from the courier — delivered, partly delivered, coming
--     back, cancelled, on hold, delivery failed
--
-- The courier is already asked every 30 minutes (20261103150000_courier_auto_sync);
-- a changed status is saved on the order, and the trigger below hands it to
-- notify, which decides whether it's news worth a notification.

-- A call to the notify function that can never break the write that caused it.
create or replace function public.notify_push(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    perform net.http_post(
      url := 'https://qgvadxivqtlgobfzbdxt.supabase.co/functions/v1/notify',
      body := payload,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.notify_push(jsonb) from public, anon, authenticated;

-- A customer's exchange / refund request ------------------------------------
create or replace function public.notify_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'customer' then
    perform public.notify_push(jsonb_build_object('action', 'request', 'id', new.id));
  end if;
  return new;
end;
$$;

revoke all on function public.notify_new_request() from public, anon, authenticated;

drop trigger if exists order_returns_notify_new on public.order_returns;
create trigger order_returns_notify_new
  after insert on public.order_returns
  for each row execute function public.notify_new_request();

-- The courier's status on an order changed ----------------------------------
create or replace function public.notify_courier_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_push(jsonb_build_object('action', 'courier', 'order_id', new.order_id));
  return new;
end;
$$;

revoke all on function public.notify_courier_change() from public, anon, authenticated;

drop trigger if exists orders_notify_courier on public.orders;
create trigger orders_notify_courier
  after update of courier_status on public.orders
  for each row
  when (new.courier_status is distinct from old.courier_status and new.courier_status is not null)
  execute function public.notify_courier_change();
