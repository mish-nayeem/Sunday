#!/usr/bin/env bash
# Builds a throwaway database from supabase/migrations (on top of
# 00-supabase-stubs.sql) and runs every tests/sql/*.test.sql against it.
# Needs psql and a Postgres to connect to (PG* environment variables, or the
# local default). Usage: tests/sql/run.sh — never against the live database.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-sunday_test}
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/sql/00-supabase-stubs.sql >/dev/null
for f in supabase/migrations/*.sql; do
  # The extensions the stubs stand in for can't be created here.
  sed -E '/(create|CREATE) (extension|EXTENSION) (if not exists|IF NOT EXISTS) "?(pg_net|pg_cron|supabase_vault|pg_stat_statements|http)"?/d' "$f" \
    | $P >/dev/null 2>/tmp/sqltest.err || { echo "✗ migration failed: $f"; cat /tmp/sqltest.err; exit 1; }
done
echo "✓ $(ls supabase/migrations/*.sql | wc -l) migrations applied"
fail=0
for t in tests/sql/*.test.sql; do
  [ -e "$t" ] || continue
  if $P -f "$t" >/tmp/sqltest.out 2>&1; then echo "✓ $(basename "$t")"; else echo "✗ $(basename "$t")"; cat /tmp/sqltest.out; fail=1; fi
done
exit $fail
