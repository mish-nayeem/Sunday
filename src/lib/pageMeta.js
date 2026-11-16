import { useEffect } from 'react';
import { canonicalPath } from './canonical.js';

// Each page's own browser-tab title, meta description and canonical
// address. Google runs the site's JavaScript, so these are what it indexes.
// (Facebook and WhatsApp don't run it; their previews come from index.html,
// or from worker/index.js for products and lookbooks.)

export const BRAND = 'SUNDAY';
export const HOME_TITLE = "SUNDAY — Premium Men's Fashion in Bangladesh | Shirts, Polos & Cargo";
export const BASE_DESC =
  "SUNDAY is Bangladesh's premium men's fashion brand. Shop luxury shirts, polos, cargo pants, and formal wear. Cash on Delivery available nationwide. Elevate your everyday style.";

// The fixed pages. Products, lookbooks and support pages set their own.
export const PAGE_META = {
  '/': { title: null, description: BASE_DESC },
  '/shop': { title: 'Shop all', description: "Every SUNDAY piece in one place: shirts, polos, t-shirts, trousers and cargo pants. Cash on Delivery all over Bangladesh." },
  '/about': { title: 'About us', description: 'The people and the idea behind SUNDAY, premium menswear from Bangladesh.' },
  '/contact': { title: 'Contact us', description: 'Questions about an order, a size or a delivery? Reach SUNDAY by phone, WhatsApp or email.' },
  '/faq': { title: 'FAQ', description: 'Payment, delivery times and charges, exchanges and order tracking at SUNDAY.' },
  '/order-tracking': { title: 'Track your order', description: 'See where your SUNDAY order is with your order ID and mobile number.' },
  '/wishlist': { title: 'Wishlist' },
  '/cart': { title: 'Bag' },
  '/checkout': { title: 'Checkout' },
};

// The shop's title and description for one drop or category
// (/shop?drop=… or /shop?category=…).
export function shopMeta(search) {
  const q = new URLSearchParams(search);
  const words = (v) => String(v || '').replace(/\+/g, ' ').trim();
  const drop = words(q.get('drop'));
  const cat = words(q.get('category'));
  if (drop) return { title: drop, description: `The ${drop} drop from SUNDAY. Cash on Delivery all over Bangladesh.` };
  if (cat && cat.toLowerCase() !== 'all') {
    const name = cat.replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());
    return { title: `${name} for men`, description: `SUNDAY ${name.toLowerCase()}: premium menswear from Bangladesh. Cash on Delivery all over Bangladesh.` };
  }
  return PAGE_META['/shop'];
}

export function fullTitle(title) {
  if (!title) return HOME_TITLE;
  return title.includes(BRAND) ? title : `${title} | ${BRAND}`;
}

export function applyPageMeta(title, description) {
  if (typeof document === 'undefined') return;
  document.title = fullTitle(title);
  document.querySelector('meta[name="description"]')?.setAttribute('content', description || BASE_DESC);
  const own = window.location.origin + canonicalPath(window.location.pathname, window.location.search);
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', own);
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', own);
}

// For a page that knows its own title (a product, a lookbook, a support page).
export default function usePageMeta(title, description, ready = true) {
  useEffect(() => {
    if (ready) applyPageMeta(title, description);
  }, [title, description, ready]);
}
