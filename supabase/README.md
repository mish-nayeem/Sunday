# supabase/

This folder is connected to the Supabase project through Supabase's GitHub
integration (Project Settings → Integrations → GitHub, working directory `.`,
production branch `main`).

Every push or merge to `main` deploys to the production project:

- **migrations/** — new files run once, in name order. Name them
  `YYYYMMDDHHMMSS_short_description.sql` (`npx supabase migration new <name>`
  creates one). Never edit a migration that has already run; add a new one.
- **functions/** — Edge Functions. Their secrets (Brevo, Telegram) are set in
  the dashboard or with `npx supabase secrets set`, never committed.
- **config.toml** — project settings from `supabase init`. The auth site URL
  and redirect URLs here match the live site; keep them in step with
  Authentication → URL Configuration in the dashboard.

The first schema (the Base44 import) was run by hand before migrations
existed; it's gone from the repo (git history has it) and must never be run
again — it would bring back old, weaker policies. Its tables are in
`migrations/20261018000000_core_tables.sql` as the live database has them
(a no-op on the live database), so the folder builds the whole database:
`tests/sql/run.sh` does exactly that on a throwaway Postgres and tests it.
