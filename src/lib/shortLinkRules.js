// Short links — sunday.com.bd/ig instead of a long tracked address in an
// Instagram bio. Kept in site_settings 'short_links' as { slug: target },
// made in Admin → Marketing → Tracked links; worker/index.js sends a visit
// to /<slug> on to <target> (its utm_ tags and all, so the visit still counts
// under its source).
//
// No imports here: the worker uses this file too.

// Until the admin has saved any, these three are there.
export const DEFAULT_SHORT_LINKS = {
  ig: '/?utm_source=insta_bio&utm_medium=bio',
  fb: '/?utm_source=fb_post&utm_medium=social&utm_campaign=page',
  wa: '/?utm_source=whatsapp&utm_medium=chat',
}

// The site's own first path segments (src/main.jsx routes, the files in
// public/ and the worker's own paths) — a short link can't take one.
export const RESERVED_SLUGS = new Set([
  'shop', 'product', 'checkout', 'cart', 'order-confirmation', 'about', 'size-guide', 'contact',
  'order-tracking', 'faq', 'privacy', 'terms', 'refund-policy', 'support', 'lookbook', 'wishlist',
  'login', 'register', 'forgot-password', 'reset-password', 'admin', 'assets', 'fonts', 'demo',
  'api', 'cdn-cgi', 'sitemap', 'robots', 'favicon', 'index', 'well-known', 'og-config', 'site',
  'images', 'videos', 'media',
])

// A slug as it may be saved: lowercase letters, digits and dashes, 1–30
// long, starting with a letter or digit, and not one of the site's own.
// Returns the clean slug, or '' when it can't be one.
export function cleanSlug(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/^\/+/, '')
  if (!/^[a-z0-9][a-z0-9-]{0,29}$/.test(s)) return ''
  if (RESERVED_SLUGS.has(s) || s.startsWith('admin')) return ''
  return s
}

// Where a short link may go: only somewhere on this site (a path with its
// query), never another website — a full address on one of `siteHosts` is
// cut down to its path. Returns the path, or '' when it's not allowed.
export function cleanTarget(raw, siteHosts = []) {
  const t = String(raw || '').trim()
  if (!t) return ''
  if (t.startsWith('/') && !t.startsWith('//') && !t.startsWith('/\\')) return t
  try {
    const u = new URL(t)
    if (u.protocol === 'https:' && siteHosts.includes(u.hostname)) return u.pathname + u.search
  } catch { /* not an address */ }
  return ''
}

// The saved list, made safe: only good slugs with allowed targets. A list
// never saved (null) is the defaults.
export function cleanShortLinks(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_SHORT_LINKS }
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    const slug = cleanSlug(k)
    const target = cleanTarget(v)
    if (slug && target) out[slug] = target
  }
  return out
}
