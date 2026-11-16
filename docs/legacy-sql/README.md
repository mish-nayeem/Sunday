# Old SQL — do not run

`sunday_supabase_schema.sql` is how SUNDAY's database was first made, when
the shop moved over from Base44 (before `supabase/migrations` existed).

**Don't run it anywhere.** It's kept only as history. Run against the live
database, it would bring back old policies and functions that later
migrations replaced, and undo security fixes.

The database is now built entirely from `supabase/migrations`:

- `20261018000000_core_tables.sql` makes the tables this file used to make,
  as the live database has them. On the live database it does nothing.
- Every migration after it runs in order, exactly as it ran live.

`tests/sql/run.sh` builds a throwaway database that way and tests it.
