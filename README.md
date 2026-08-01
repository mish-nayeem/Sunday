# SUNDAY — Supabase Edition

This is your SUNDAY storefront, rebuilt to run on Supabase instead of Base44, so it
can be hosted for free on Vercel/Netlify.

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

## Setup steps

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in your Supabase project URL + anon key
3. Run `sunday_supabase_schema.sql` in your Supabase project's SQL Editor (if you haven't already)
4. In Supabase → Storage, create a public bucket named `product-images`
5. In Supabase → Authentication → Providers, enable Google if you want Google login
6. `npm run dev` to test locally
7. Push to GitHub, import into Vercel, add the two env vars there, deploy

See `SUNDAY_migration_guide.md` for full explanations of every change.
