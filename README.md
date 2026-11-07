# SUNDAY

The SUNDAY clothing shop and its admin panel.

- **Shop:** React (Vite + Tailwind), served by a Cloudflare Worker.
- **Data:** Supabase — database, logins, photo storage and edge functions (emails, courier, notifications).
- **Admin:** `/admin`, signed in with the admin email. It can be installed as an app on a phone.

## How a change goes live

Every change goes through a pull request into `main`. Merging it runs everything by itself:

| What changed | What happens on merge |
| --- | --- |
| `src/`, `public/`, `worker/`, `index.html` | The **Deploy** workflow builds the site and deploys it to Cloudflare. |
| `supabase/migrations/*.sql` | Supabase's GitHub integration runs each new file once, in name order. |
| `supabase/functions/*` | The **Deploy edge functions** workflow deploys them to Supabase. |

> A migration changes the live database the moment it's merged. Read any `.sql` file in a pull request before merging it.

Other workflows:

- **Backup:** every night, an encrypted dump of the database.
- **Schema snapshot:** the live database structure, pushed to the `schema-snapshot` branch.

## Folders

```
src/
  pages/            shop pages (Home, Shop, ProductDetail, Checkout, OrderTracking, …)
  components/       shop parts (header, footer, product cards, cart, lookbook)
  lib/              shop helpers (Supabase client, cart, prices, photos, SEO)
  admin/            the admin panel
    pages/Admin.jsx   the panel itself, tab by tab
    components/       one file per tool (ProductForm, HeroManager, ReturnsManager, …)
    lib/              admin helpers (saving products, courier, emails, stock)
worker/             the Cloudflare Worker: link previews, security headers, robots.txt, sitemap.xml
scripts/            build helpers (security headers)
supabase/
  migrations/       database changes, one file each (see supabase/README.md)
  functions/        edge functions: order and status emails, restock alerts, courier, notifications
sunday_supabase_schema.sql   the first schema, run by hand once; never run it again
```

## Products, in the admin

**Colours**

- Each colour is its own product. Colours belong together through a *colour group*. There are two ways to set it:
  - **+ Add another colour**;
  - **Join the colours of…** in the product form.
- The same name alone links nothing.
- **Keep this product on its own** takes a product out of its group.
- A colour can have its own price.
- When you edit one colour, its shared details can go to the other colours too. Their own price, photos and stock stay as they are.

**Photos**

- Drag photos to reorder them, or drop files from the computer onto the box.
- **✥ Adjust** moves and zooms a photo inside its card, like a Facebook cover. The product page uses the same framing.

**Collection**

- A collection is optional. A product without one shows in the shop under its category.

## Running it on your computer

You need Node 22.

```
npm install
cp .env.local.example .env.local   # then fill in the project URL and anon key
npm run dev                         # the site on http://localhost:5173
npm run build                       # what the Deploy workflow builds
npm run lint
```

The anon key is public by design, because every table is protected by row-level security. The **service_role** key is not public. Never put it in `.env.local`, in the site, or in a commit.

## Settings and secrets

**Site build:** GitHub → Settings → Secrets and variables → Actions.

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- optional: `VITE_SITE_URL`, `VITE_SENTRY_DSN`, `VITE_IMAGE_CDN_HOST`
- for the deploy: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

**Edge functions:** Supabase → Edge Functions → Secrets.

- Brevo email: `BREVO_API_KEY`, plus the sender name and address. The sender must be verified in Brevo.
- `SITE_URL`, `SENTRY_DSN`
- `GEMINI_API_KEY`, for reading order messages

Supabase sets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for every function by itself. Courier keys go in Admin → Courier setup.

**Backups:** GitHub Actions secrets.

- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `BACKUP_PASSPHRASE`

**Logins:** Supabase → Authentication → URL Configuration.

- The Site URL and Redirect URLs must match the live address. Otherwise Google login and password reset fail.

Set secrets in these dashboards only. Never write them into a file, an issue, a pull request or a chat.
