# SUNDAY — Base44 → Supabase Migration Guide

This guide replaces every `base44.*` call in your codebase with a Supabase equivalent,
so the app can be self-hosted for free (Vercel/Netlify + Supabase free tier) instead of
paying Base44's monthly fee.

Database schema: see `sunday_supabase_schema.sql` (already provided — run it first in
Supabase SQL Editor before doing anything below).

---

## 0. Setup

1. Create a free project at supabase.com
2. Run `sunday_supabase_schema.sql` in SQL Editor
3. Go to Project Settings → API, copy your `Project URL` and `anon public` key
4. Install the client:
   ```bash
   npm uninstall @base44/sdk @base44/vite-plugin
   npm install @supabase/supabase-js
   ```
5. Add to `.env.local` (and to Vercel/Netlify env vars when you deploy):
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
6. In `vite.config.js`, remove the `base44` plugin entirely:
   ```js
   import react from '@vitejs/plugin-react'
   import { defineConfig } from 'vite'

   export default defineConfig({
     plugins: [react()],
   });
   ```

---

## 1. Replace `src/api/base44Client.js`

Delete this file's contents and replace with a new Supabase client:

**New file: `src/lib/supabaseClient.js`**
```js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

Delete `src/api/base44Client.js` and `src/lib/app-params.js` (no longer needed).

Then in every file, replace:
```js
import { base44 } from '@/api/base44Client';
```
with:
```js
import { supabase } from '@/lib/supabaseClient';
```

---

## 2. Auth — `src/lib/AuthContext.jsx`

Rewrite completely:

```jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    checkUserAuth();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadProfile(session.user);
      else { setUser(null); setProfile(null); setIsAuthenticated(false); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadProfile = async (authUser) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
    setUser(authUser);
    setProfile(data); // data.role tells you 'admin' or 'user'
    setIsAuthenticated(true);
  };

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await loadProfile(user);
    else { setIsAuthenticated(false); }
    setIsLoadingAuth(false);
    setAuthChecked(true);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user, profile, isAuthenticated, isLoadingAuth, authChecked,
      logout, checkUserAuth,
      isAdmin: profile?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
```

Note: `appPublicSettings`, `authError` (user_not_registered etc.) are Base44-specific
concepts that don't apply to Supabase — every signed-up user is automatically "registered"
via the `profiles` trigger. You can delete `UserNotRegisteredError.jsx` and simplify
`App.jsx` (see section 8).

---

## 3. Auth pages

### `src/pages/Login.jsx`
Replace the two handlers:
```js
const handleSubmit = async (e) => {
  e.preventDefault();
  setError(''); setLoading(true);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) setError(error.message);
  else window.location.href = '/';
  setLoading(false);
};

const handleGoogle = async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
};
```

### `src/pages/Register.jsx`
Supabase's default flow sends a confirmation **link** by email, not a 6-digit OTP box.
Simplest change — replace the whole submit handler and drop the `showOtp` step:
```js
const handleSubmit = async (e) => {
  e.preventDefault();
  setError('');
  if (password !== confirmPassword) { setError('Passwords do not match'); return; }
  setLoading(true);
  const { error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) setError(error.message);
  else setShowOtp(true); // now just show "check your email" message, no code input needed
  setLoading(false);
};

const handleGoogle = async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
};
```
(If you want the exact 6-digit OTP box UI to keep working, Supabase supports
`supabase.auth.signInWithOtp({ email })` + `supabase.auth.verifyOtp({ email, token, type: 'email' })`
as an alternative — ask me if you want this wired in instead of the link flow.)

### `src/pages/ForgotPassword.jsx`
```js
const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  setLoading(false);
  setSent(true);
};
```

### `src/pages/ResetPassword.jsx`
Supabase puts the recovery session in the URL hash automatically after the user clicks
the email link, so you don't need to read a `?token=` param — just call:
```js
const handleSubmit = async (e) => {
  e.preventDefault();
  if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
  setLoading(true);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) setError(error.message);
  else window.location.href = '/login';
  setLoading(false);
};
```
You can remove the `resetToken` / `useSearchParams` check entirely.

### `src/components/ProtectedRoute.jsx`
```jsx
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked } = useAuth();
  if (isLoadingAuth || !authChecked) return fallback;
  if (!isAuthenticated) return unauthenticatedElement;
  return <Outlet />;
}
```

### `src/pages/Admin.jsx`
Add an admin check (Supabase has no built-in role gate, we use the `profiles.role` column):
```js
const { profile, isAdmin, logout } = useAuth();
useEffect(() => {
  if (authChecked && !isAdmin) window.location.href = '/login';
}, [authChecked, isAdmin]);
```
Replace `base44.auth.me()` / `base44.auth.logout()` calls with the `useAuth()` hook.

---

## 4. Data — the `base44.entities.X` → `supabase.from('x')` pattern

General mapping (this covers ~95% of your calls):

| Base44 | Supabase |
|---|---|
| `entities.Product.list('-created_date', 100)` | `supabase.from('products').select('*').order('created_at', { ascending: false }).limit(100)` |
| `entities.Product.filter({ category }, sort, 100)` | `supabase.from('products').select('*').eq('category', category).order(...).limit(100)` |
| `entities.Product.get(id)` | `supabase.from('products').select('*').eq('id', id).single()` |
| `entities.Product.create({...})` | `supabase.from('products').insert({...}).select().single()` |
| `entities.Product.update(id, {...})` | `supabase.from('products').update({...}).eq('id', id)` |
| `entities.Product.delete(id)` | `supabase.from('products').delete().eq('id', id)` |
| `entities.Product.bulkUpdate([{id, ...}])` | loop `supabase.from('products').update({...}).eq('id', item.id)` per item (see Checkout below), or use `.upsert([...])` |

All calls return `{ data, error }` — always check `error` before using `data`.

**Table names** (entity → table): Product→`products`, Order→`orders`, Review→`reviews`,
Expense→`expenses`, Invoice→`invoices`, NewsletterSubscriber→`newsletter_subscribers`,
ContactMessage→`contact_messages`, Settings→`settings`.

### Example — `src/pages/Home.jsx`
```js
const { data: all } = await supabase.from('products').select('*').order('created_at', { ascending: false }).limit(50);
setFeatured((all || []).filter(p => p.is_featured).slice(0, 4));
setNewArrivals((all || []).filter(p => p.is_new_arrival).slice(0, 4));
setBestSellers((all || []).filter(p => p.is_best_seller).slice(0, 4));
```

### Example — `src/pages/Shop.jsx`
```js
let query = supabase.from('products').select('*');
if (category !== 'all') query = query.eq('category', category);
const [sortField, ascending] = sort.startsWith('-') ? [sort.slice(1), false] : [sort, true];
const sortColumn = sortField === 'created_date' ? 'created_at' : sortField;
query = query.order(sortColumn, { ascending }).limit(100);
const { data } = await query;
let items = data || [];
if (search.trim()) { /* keep your existing client-side filter as-is */ }
```

### Example — `src/pages/ProductDetail.jsx`
```js
const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
setProduct(p);
...
const { data: rel } = await supabase.from('products').select('*').eq('category', p.category).order('created_at', { ascending: false }).limit(5);
setRelated((rel || []).filter(r => r.id !== p.id).slice(0, 4));
```

### Example — `src/pages/OrderTracking.jsx` and `OrderConfirmation.jsx`
These need the secure `track_order` function from the schema (so a customer can't query
other people's orders directly):
```js
const { data } = await supabase.rpc('track_order', {
  p_order_id: query.trim().toUpperCase(),
  p_mobile: null,
});
if (data && data.length > 0) setOrder(data[0]);
else {
  const { data: byMobile } = await supabase.rpc('track_order', { p_order_id: null, p_mobile: query.trim() });
  if (byMobile?.length > 0) setOrder(byMobile[0]);
  else setNotFound(true);
}
```
For `OrderConfirmation.jsx` (looked up right after checkout by `orderId`), same pattern with
`p_order_id: orderId`.

### Example — `src/components/products/ReviewsSection.jsx`
```js
const { data } = await supabase.from('reviews').select('*')
  .eq('product_id', product.id).eq('is_approved', true)
  .order('created_at', { ascending: false }).limit(50);
setReviews(data || []);
...
await supabase.from('reviews').insert({
  product_id: product.id, product_name: product.name,
  author_name: form.author_name, rating: form.rating, comment: form.comment, is_approved: false,
});
```

### Example — `src/components/layout/Footer.jsx` (newsletter)
```js
await supabase.from('newsletter_subscribers').insert({ email: email.trim() });
```

### Example — `src/pages/Contact.jsx`
```js
await supabase.from('contact_messages').insert(form);
```

All the **Admin components** (AdminOrders, AdminProducts, AdminCustomers, AdminExpenses,
AdminReviews, AdminInvoices, AdminSettings, ProductForm, AdminStats) follow the exact
same `.select()` / `.insert()` / `.update()` / `.delete()` pattern — swap every
`base44.entities.X.method(...)` call using the table above. Since this is fully
mechanical, if you paste me any one admin file again after you've done the swap I'm
happy to sanity-check it.

---

## 5. Realtime — `AdminOrders.jsx` subscribe

Replace:
```js
const unsubscribe = base44.entities.Order.subscribe((event) => { ... });
```
with:
```js
useEffect(() => {
  const channel = supabase
    .channel('orders-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
      setOrders(prev => [payload.new, ...prev]);
      setNewOrderIds(prev => [payload.new.id, ...prev]);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
      setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}, []);
```
(Realtime is on by default for new Supabase projects; if events don't arrive, enable it
under Database → Replication for the `orders` table.)

---

## 6. File uploads — `ProductForm.jsx` image upload

1. In Supabase Dashboard → Storage, create a public bucket named `product-images`.
2. Replace:
```js
const { file_url } = await base44.integrations.Core.UploadFile({ file });
setImages(prev => [...prev, file_url]);
```
with:
```js
const fileName = `${Date.now()}-${file.name}`;
const { error } = await supabase.storage.from('product-images').upload(fileName, file);
if (!error) {
  const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
  setImages(prev => [...prev, data.publicUrl]);
}
```

---

## 7. Email sending — `Checkout.jsx`

Supabase does **not** send arbitrary transactional emails itself (it only sends its own
auth emails — signup confirmation, password reset). For order-notification emails you
have two free-tier-friendly options:

- **Option A (simplest): drop it.** You already send the customer a WhatsApp-confirm
  link on the Order Confirmation page — many COD stores skip email entirely and rely on
  WhatsApp + the admin panel's realtime "new order" banner (which you already have).
- **Option B: Supabase Edge Function + Resend** (Resend's free tier gives 3,000
  emails/month). I can write this Edge Function for you if you want to keep the emails —
  just say so and tell me your Resend API key setup preference.

For now, in `Checkout.jsx`, remove the two `base44.integrations.Core.SendEmail(...)` blocks
(admin email + customer email). The order is still saved and visible instantly in
Admin → Orders via realtime either way.

### Stock decrement (`base44.entities.Product.bulkUpdate`)
Replace:
```js
await base44.entities.Product.bulkUpdate(stockUpdates);
```
with:
```js
await Promise.all(
  stockUpdates.map(u =>
    supabase.from('products').update({ quantity: u.quantity, size_stock: u.size_stock }).eq('id', u.id)
  )
);
```

### Order + Invoice creation in Checkout.jsx
```js
const { error: orderError } = await supabase.from('orders').insert({
  order_id: oid, full_name: form.full_name, email: form.email, mobile: form.mobile,
  address: form.address, district: form.district, area: form.area, notes: form.notes,
  items: cart.map(i => ({ product_id: i.productId, name: i.name, size: i.size, quantity: i.quantity, price: i.price, image: i.image, sku: i.sku })),
  subtotal, delivery_charge: deliveryCharge, total,
  payment_method: 'cod', payment_status: 'unpaid', invoice_number: invoiceNumber, status: 'pending',
});

await supabase.from('invoices').insert({
  invoice_number: invoiceNumber, order_id: oid, customer_name: form.full_name,
  customer_mobile: form.mobile, customer_address: `${form.address}, ${form.area}, ${form.district}`,
  items: cart.map(i => ({ name: i.name, size: i.size, quantity: i.quantity, price: i.price })),
  subtotal, delivery_charge: deliveryCharge, total,
  issue_date: new Date().toISOString().split('T')[0], status: 'issued',
});
```

### Settings lookup in Checkout.jsx
```js
useEffect(() => {
  supabase.from('settings').select('*').limit(1).then(({ data }) => { if (data?.length) setSettings(data[0]); });
}, []);
```

---

## 8. `src/App.jsx` simplification

Base44's `authError` / `user_not_registered` states don't exist in Supabase — every
signed-up user gets a `profiles` row automatically. Simplify `AuthenticatedApp`:

```jsx
const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-2xl font-black tracking-[0.15em] text-obsidian mb-4">SUNDAY</p>
          <div className="w-6 h-6 border-2 border-sand border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }
  return (
    <Routes>
      {/* ...unchanged... */}
    </Routes>
  );
};
```
Keep all the `<Route>` entries exactly as they are. You can delete the
`UserNotRegisteredError` import/usage and the `QueryClientProvider`/`react-query` bits can
stay (they're unrelated to Base44).

---

## 9. Deploy for free

1. Push the whole repo to GitHub (a plain git repo, not tied to Base44 anymore).
2. Go to vercel.com → New Project → import the GitHub repo.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in
   Vercel → Project Settings → Environment Variables.
5. Deploy. Add your custom domain (`sunday.com.bd`) under Vercel → Domains — same DNS
   process as pointing any domain at any host.
6. In Supabase → Authentication → URL Configuration, set your Site URL to the real
   domain (needed for the OAuth/reset-password redirects to work correctly).

Netlify works the same way if you prefer it over Vercel — build command and output
directory are identical.

---

## What's left for you to actually do the swap

This guide covers every distinct pattern in your codebase. The remaining work is
mechanical repetition of these same patterns across:
- `AdminCustomers.jsx`, `AdminExpenses.jsx`, `AdminInvoices.jsx`, `AdminProducts.jsx`,
  `AdminReviews.jsx`, `AdminSettings.jsx`, `AdminStats.jsx` — swap entity calls per the table in §4
- `CategoriesSection.jsx`, `SearchOverlay.jsx`, `Wishlist.jsx` — swap `Product.list`/`filter` calls
- `About.jsx`, `FAQ.jsx`, `Privacy.jsx`, `Terms.jsx`, `SizeGuide.jsx` — no Base44 calls at all, untouched

Paste me any file after you've made the swap (or before, if you'd rather I do it) and
I'll write out the fully converted version — happy to go file-by-file with you.
