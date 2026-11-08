import { fetchSetting, saveSetting } from './siteSettings.js'

// Banners the admin designs (Website → Banners → Your banners), kept in
// site_settings 'custom_banners' as a list in the order they show.
//
// A banner is either:
//   * written here: words, colours, font, size, alignment;
//   * or a picture made elsewhere (Canva…) and uploaded — with a picture of
//     its own for phones if wanted.
// Either way it can carry a countdown, a coupon code to copy, and a link:
//   * to the products on a sale;
//   * to products picked by hand;
//   * to a collection, everything, or any page.
// It shows on the pages ticked, between its start and end times.

export const KEY = 'custom_banners'

// Fonts a banner can be written in. 'heading' and 'body' are the site's
// own; the rest come from Google Fonts, loaded only when a banner uses one.
export const FONTS = [
  { key: 'heading', label: 'SUNDAY heading (Newsreader)', css: 'var(--font-heading)' },
  { key: 'body', label: 'SUNDAY text (Instrument Sans)', css: 'var(--font-body)' },
  { key: 'bebas', label: 'Bebas Neue — tall caps', css: "'Bebas Neue', sans-serif", google: 'Bebas+Neue' },
  { key: 'anton', label: 'Anton — bold', css: "'Anton', sans-serif", google: 'Anton' },
  { key: 'archivo', label: 'Archivo Black — heavy', css: "'Archivo Black', sans-serif", google: 'Archivo+Black' },
  { key: 'playfair', label: 'Playfair Display — elegant', css: "'Playfair Display', serif", google: 'Playfair+Display:wght@400;700' },
  { key: 'dmserif', label: 'DM Serif Display', css: "'DM Serif Display', serif", google: 'DM+Serif+Display' },
  { key: 'space', label: 'Space Mono — typewriter', css: "'Space Mono', monospace", google: 'Space+Mono:wght@400;700' },
  { key: 'pacifico', label: 'Pacifico — handwritten', css: "'Pacifico', cursive", google: 'Pacifico' },
]

export const fontOf = (key) => FONTS.find((f) => f.key === key) || FONTS[0]

// Where a banner can show.
export const PLACES = [
  { key: 'home', label: 'Homepage · under the hero' },
  { key: 'home-end', label: 'Homepage · near the bottom' },
  { key: 'shop', label: 'Shop · over the products' },
  { key: 'cart', label: 'Bag · above Checkout' },
]

// How tall a written banner is; a picture keeps its own shape.
export const HEIGHTS = [
  { key: 's', label: 'Small', px: 90 },
  { key: 'm', label: 'Medium', px: 160 },
  { key: 'l', label: 'Large', px: 260 },
  { key: 'xl', label: 'Extra large', px: 400 },
]

// How wide, on a computer. Phones always use the full width.
export const WIDTHS = [
  { key: 'full', label: 'Full width', cls: 'md:col-span-6' },
  { key: 'two', label: 'Half (two side by side)', cls: 'md:col-span-3' },
  { key: 'three', label: 'Third (three side by side)', cls: 'md:col-span-2' },
]

export function newBanner() {
  return {
    id: `b${Date.now().toString(36)}`,
    on: true,
    name: 'New banner',
    mode: 'design', // design | image
    // Written
    eyebrow: 'LIMITED TIME',
    title: 'EID SALE · 20% OFF',
    text: 'On every shirt, this week only.',
    button: 'Shop the sale',
    bg: '#141414',
    bg2: '',
    color: '#FFFFFF',
    accent: '#FF7254',
    font: 'heading',
    textFont: 'body',
    titleSize: 36,
    align: 'center', // left | center | right
    height: 'm',
    radius: 0,
    // Picture
    image: '',
    imagePhone: '',
    alt: '',
    // Where and how big
    places: ['home'],
    width: 'full',
    // When
    starts_at: '',
    ends_at: '',
    timer: false,
    timerLabel: 'Ends in',
    timerTo: '', // empty = ends_at
    // Coupon
    code: '',
    // Click
    link: 'none', // none | sale | products | drop | all | url
    sale_id: '',
    product_ids: [],
    drop: '',
    url: '',
  }
}

export async function fetchCustomBanners() {
  const { value, error } = await fetchSetting(KEY)
  const list = Array.isArray(value) ? value.filter((b) => b && b.id).map((b) => ({ ...newBanner(), ...b })) : []
  return { banners: list, error }
}

export function saveCustomBanners(list) {
  return saveSetting(KEY, list)
}

// On, and inside its start and end times.
export function isLive(b, now = Date.now()) {
  if (!b?.on) return false
  if (b.starts_at && new Date(b.starts_at).getTime() > now) return false
  if (b.ends_at && new Date(b.ends_at).getTime() <= now) return false
  return true
}

// Where a click takes the shopper (null = nowhere).
export function linkOf(b) {
  switch (b.link) {
    case 'sale': return b.sale_id ? `/shop?sale=${encodeURIComponent(b.sale_id)}` : '/shop'
    case 'products': return (b.product_ids || []).length ? `/shop?offer=${encodeURIComponent(b.id)}` : null
    case 'drop': return b.drop ? `/shop?drop=${encodeURIComponent(b.drop)}` : null
    case 'all': return '/shop'
    case 'url': return /^(https:\/\/|\/)/.test(b.url || '') ? b.url : null
    default: return null
  }
}

// A Google font a banner uses, loaded once.
export function loadFont(key) {
  const f = fontOf(key)
  if (!f.google || typeof document === 'undefined') return
  const id = `gf-${f.key}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`
  document.head.appendChild(link)
}

// A colour typed by hand: #RGB or #RRGGBB only (it goes into a style).
export function safeColor(c, fallback) {
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(c || '')) ? c : fallback
}
