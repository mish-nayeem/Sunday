-- page_views: who may log a visit (MEDIUM-4). Runs on the throwaway
-- database tests/sql/run.sh builds — never live.
\set ON_ERROR_STOP on

set role anon;
set request.headers = '{"x-forwarded-for": "198.51.100.9", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"}';

-- A shopper's visit is counted.
insert into public.page_views (session_id, path, device) values ('s1', '/shop', 'mobile');

do $$
declare ok boolean;
begin
  -- A bot isn't.
  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.10", "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"}', false);
  ok := false;
  begin
    insert into public.page_views (session_id, path) values ('s2', '/');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'a bot visit was counted'; end if;

  -- An oversized path isn't.
  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.11", "user-agent": "Mozilla/5.0"}', false);
  ok := false;
  begin
    insert into public.page_views (session_id, path) values ('s3', repeat('a', 301));
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'a 301-character path was counted'; end if;

  -- One address: 300 an hour, then no more.
  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.12", "user-agent": "Mozilla/5.0"}', false);
  for i in 1..300 loop
    insert into public.page_views (session_id, path) values ('s4', '/p' || i);
  end loop;
  ok := false;
  begin
    insert into public.page_views (session_id, path) values ('s4', '/one-too-many');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'the 301st visit in an hour was counted'; end if;

  -- Another address is still fine.
  perform set_config('request.headers', '{"x-forwarded-for": "198.51.100.13", "user-agent": "Mozilla/5.0"}', false);
  insert into public.page_views (session_id, path) values ('s5', '/');

  raise notice 'page_views: all checks passed';
end
$$;
reset role;
