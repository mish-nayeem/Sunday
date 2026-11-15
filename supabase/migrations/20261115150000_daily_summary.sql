-- The evening round-up on the admin's phone, as on PAUSE: every day at
-- 22:00 Dhaka (16:00 UTC) the notify function sends "📊 Today · N orders ·
-- ৳…" with what's still waiting — bKash advances to check, parcels to send,
-- return / exchange requests. notify sends it once a day and only in the
-- evening (push_sent 'summary:<date>'), so nothing else can trigger it.
--
-- Uses public.notify_push (20261106120000_more_phone_notifications.sql),
-- which can never fail the job.

do $outer$
begin
  begin
    perform 1 from pg_extension where extname = 'pg_cron';
    if not found then
      create extension if not exists pg_cron;
    end if;
  exception when others then
    raise notice 'pg_cron is not available: no evening round-up (%).', sqlerrm;
    return;
  end;

  begin
    perform cron.unschedule('admin-daily-summary');
  exception when others then null;
  end;

  execute $sql$
    select cron.schedule(
      'admin-daily-summary',
      '0 16 * * *',
      $job$ select public.notify_push('{"action":"summary"}'::jsonb); $job$
    )
  $sql$;
end
$outer$;
