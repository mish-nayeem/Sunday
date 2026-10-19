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

The original schema (`../sunday_supabase_schema.sql`) was run by hand before
this integration existed, so it is not a migration and must not be re-run.
