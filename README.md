# SUNDAY — Supabase Edition

This is your SUNDAY storefront, rebuilt to run on Supabase instead of Base44, so it
can be hosted for free on Cloudflare. Everything — database, auth, and product
photos (Storage) — runs on Supabase; there is no Cloudinary dependency.

## What's included in this package (fully converted, ready to use)

- `src/lib/supabaseClient.js` — new Supabase connection (replaces `base44Client.js`)
- `src/lib/AuthContext.jsx` — Supabase Auth (email/password + Google OAuth)
- `src/lib/cartStore.js` — cart/wishlist (localStorage, rebuilt since the original
  wasn't fully recovered during migration — same behavior, double-check against your
  original if you still have Base44 access)
- `src/components/ProtectedRoute.jsx`
- `src/pages/Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`
- `src/App.jsx`, `src/main.jsx`, `src/index.css`, `index.html`
- `src/pages/Home.jsx`, `Shop.jsx`, `ProductDetail.jsx`, `Checkout.jsx`,
  `OrderTracking.jsx`, `OrderConfirmation.jsx`, `Contact.jsx`, `Wishlist.jsx`
- All of `src/components/admin/*` (Stats, Orders, Products, Customers, Expenses,
  Reviews, Invoices, Settings, ProductForm)
- `package.json` (Base44 packages removed, `@supabase/supabase-js` added),
  `vite.config.js` (Base44 plugin removed), `tailwind.config.js`, `postcss.config.js`,
  `jsconfig.json`

## What you still need to copy in yourself, unchanged, from your Base44 project

These files have **no Base44 dependency** (or only a one-line change already documented
below), so just copy them over as-is from the Base44 code editor — no conversion needed:

- `src/components/ui/*` — the whole shadcn/ui library (Button, Card, Dialog, etc.)
- `src/components/layout/Header.jsx`, `SiteLayout.jsx`, `WhatsAppButton.jsx`
- `src/components/home/*` — HeroSection, CategoriesSection, WhyChooseSection,
  InstagramSection, ReviewsSection (home version), SearchOverlay
- `src/components/products/ProductCard.jsx`, `SizeChartPopup.jsx`
- `src/components/AuthLayout.jsx`, `GoogleIcon.jsx`, `ScrollToTop.jsx`
- `src/hooks/*`, `src/lib/invoicePdf.js`, `src/lib/query-client.js`, `src/lib/utils.js`,
  `src/lib/PageNotFound.jsx`
- `src/pages/About.jsx`, `FAQ.jsx`, `Privacy.jsx`, `Terms.jsx`, `SizeGuide.jsx`, `Cart.jsx`

### One exception — `Footer.jsx`
Your Footer has a newsletter signup that calls `base44.entities.NewsletterSubscriber.create(...)`.
Copy the file in as-is, then change just that one line to:
```js
await supabase.from('newsletter_subscribers').insert({ email: email.trim() });
```
(and add `import { supabase } from '@/lib/supabaseClient';` at the top).

### Also check — `components/products/ReviewsSection.jsx` (the product-page one)
This one calls `base44.entities.Review.list(...)` / `.create(...)`. Swap those two calls
using the pattern shown in `SUNDAY_migration_guide.md`, section 4.

## Order confirmation email + invoice PDF (Brevo)

`Checkout.jsx` calls a Supabase Edge Function (`supabase/functions/send-order-confirmation`)
right after an order is placed. It fetches the order, generates the invoice PDF server-side,
and sends it to the customer via Brevo's transactional email API. It only fires if the
customer entered an email at checkout — nothing blocks if they didn't.

To wire it up:

1. Install the Supabase CLI if you haven't: `npm install -g supabase`
2. Log in and link your project: `supabase login` then `supabase link --project-ref <your-project-ref>`
3. Deploy the function: `supabase functions deploy send-order-confirmation`
4. In [Brevo](https://app.brevo.com), verify a sender email/domain and grab an API key
   (Settings → SMTP & API → API Keys)
5. Set the secrets Supabase will inject into the function:
   ```
   supabase secrets set BREVO_API_KEY=your-brevo-api-key
   supabase secrets set BREVO_SENDER_EMAIL=orders@yourdomain.com
   supabase secrets set BREVO_SENDER_NAME=SUNDAY
   ```
   (`BREVO_SENDER_EMAIL` must be a verified sender in Brevo, or sends will fail.)
6. Place a test order with your own email at checkout and confirm the email + PDF arrive.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` don't need to be set manually — Supabase
injects those into every Edge Function automatically.

## Setup steps

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in your Supabase project URL + anon key
3. Run `sunday_supabase_schema.sql` in your Supabase project's SQL Editor (if you haven't already)
4. Database changes after the original schema live in `supabase/migrations/` and are
   applied automatically when they reach `main` (Supabase GitHub integration — see
   `supabase/README.md`)
5. In Supabase → Authentication → Providers, enable Google if you want Google login
6. `npm run dev` to test locally
7. Deploy to Cloudflare (below)

## Deploying to Cloudflare

The site is a static build served by Cloudflare Workers (static assets, see `wrangler.jsonc`).

**Option A — connect GitHub (auto-deploy on every push):**
1. Cloudflare Dashboard → Workers & Pages → Create → Import a repository → pick this repo
2. Build command: `npm run build` · Deploy command: `npx wrangler deploy`
3. Settings → Build → **Variables and secrets**: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (they're baked in at build time, so they must be *build* variables)
4. Add your custom domain under the Worker's Settings → Domains & Routes
5. In Supabase → Authentication → URL Configuration, set the Site URL and add the
   Cloudflare domain to Redirect URLs (needed for Google login and password reset)

**Option B — deploy from your computer:** with `.env.local` filled in, run
`npx wrangler login` once, then `npm run deploy`.

Old product photos already stored on Cloudinary keep showing (their URLs are just plain
links); new uploads go to Supabase Storage. Re-upload old photos from the admin panel
whenever you want to drop the Cloudinary account completely.

See `SUNDAY_migration_guide.md` for full explanations of every change.
