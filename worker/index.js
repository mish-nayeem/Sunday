import { withSecurityHeaders } from './security-headers.js';
import { cleanShortLinks, cleanSlug } from '../src/lib/shortLinkRules.js';
import { canonicalPath } from '../src/lib/canonical.js';

// Link previews for shared product and lookbook pages.
//
// WhatsApp, Facebook and Messenger read a link's HTML without running the
// site's JavaScript, so every page showed the same site-wide preview. For
// /product/:id and /lookbook/:drop(?look=id) this worker looks the product
// or look up in Supabase and writes its own title, text and photo into the
// page's preview tags. Every other request is plain static assets (see
// run_worker_first in wrangler.jsonc).
//
// The Supabase URL and public anon key come from /og-config.json, written
// at build time from the same VITE_ variables the site uses.
//
// It also makes the admin installable as an app: /admin pages get the
// manifest, the iPhone home-screen tags and the admin icon, so Android offers
// "Install" and iPhone's "Add to Home Screen" makes SUNDAY Admin. The shop's
// own pages never carry them (src/admin/lib/adminApp.js adds the same tags
// when the admin is reached from inside the shop without a reload).
const SHARE_SUFFIX = '.share.jpg';


export default {
  async fetch(request, env, ctx) {
    return withSecurityHeaders(await handle(request, env, ctx));
  },
};

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/robots.txt') return robots(url);
  if (request.method === 'GET' && url.pathname === '/sitemap.xml') return sitemap(url, env);
  // Short links (sunday.com.bd/ig): on to where they point.
  if (request.method === 'GET') {
    const short = await shortLinkFor(url, env, ctx);
    if (short) return short;
  }
  let page = await env.ASSETS.fetch(request);
  // The admin, checkout, cart, sign-in and order pages never in search results.
  if (isPrivatePage(url.pathname)) page = withNoIndex(page);
  if (request.method !== 'GET' || !(page.headers.get('content-type') || '').includes('text/html')) return page;
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return adminApp(page);

  try {
    const meta = await previewFor(url, env);
    return meta ? rewrite(page, meta) : withCanonical(page, url);
  } catch {
    return page; // a preview is never worth a broken page
  }
}

// ---------- Search engines ----------
// robots.txt and sitemap.xml are written here, on whatever address the site
// is reached on, so they're right before and after a custom domain. The
// sitemap lists the shop's pages and every product a shopper can see (the
// public read, so hidden or not-yet-launched ones stay out).
//
// The admin, checkout, cart, sign-in and order pages aren't blocked here on
// purpose: each is sent with X-Robots-Tag: noindex (below), and a crawler
// has to be able to fetch a page to see that — a page blocked in robots.txt
// can still be listed by its address alone.
function robots(url) {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${url.origin}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

const SITEMAP_PAGES = ['/', '/shop', '/about', '/contact', '/support/faq', '/order-tracking', '/support'];

async function sitemap(url, env) {
  let products = [];
  let lookbooks = [];
  try {
    const cfgRes = await env.ASSETS.fetch(new Request(new URL('/og-config.json', url)));
    const cfg = cfgRes.ok ? await cfgRes.json() : {};
    if (cfg.url && cfg.key) {
      const r = await fetch(`${cfg.url}/rest/v1/products?select=id,updated_at,created_at&order=created_at.desc`, {
        headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      });
      if (r.ok) products = await r.json();
      // Each drop's lookbook with visible looks, less the ones the admin hid.
      const get = (path) => fetch(`${cfg.url}/rest/v1/${path}`, { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` } })
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []);
      const [looks, hiddenRows] = await Promise.all([
        get('lookbook_looks?select=drop_name&active=eq.true'),
        get('site_settings?select=value&key=eq.lookbook_hidden'),
      ]);
      const key = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const hidden = new Set((Array.isArray(hiddenRows?.[0]?.value) ? hiddenRows[0].value : []).map(key));
      const seen = new Map();
      for (const l of Array.isArray(looks) ? looks : []) {
        const k = key(l.drop_name);
        if (k && !hidden.has(k) && !seen.has(k)) seen.set(k, String(l.drop_name).trim());
      }
      lookbooks = [...seen.values()];
    }
  } catch { /* pages only */ }

  const entry = (path, lastmod, priority) =>
    `  <url><loc>${escapeXml(url.origin + path)}</loc>${lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : ''}<priority>${priority}</priority></url>`;
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...SITEMAP_PAGES.map((p) => entry(p, null, p === '/' ? '1.0' : p === '/shop' ? '0.9' : '0.5')),
    ...products.map((p) => entry(`/product/${encodeURIComponent(p.id)}`, p.updated_at || p.created_at, '0.8')),
    ...lookbooks.map((d) => entry(`/lookbook/${encodeURIComponent(d)}`, null, '0.6')),
    '</urlset>',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Pages no use in a search result. Each is sent with X-Robots-Tag: noindex,
// which Google, Bing and the rest obey; the admin's page says it in its
// <head> too. Login guards the admin either way — this keeps its address out
// of search, not people out of it.
const PRIVATE_PAGES = ['/admin', '/checkout', '/cart', '/login', '/register', '/forgot-password', '/reset-password', '/order-confirmation', '/wishlist'];
export const isPrivatePage = (path) =>
  PRIVATE_PAGES.some((p) => path === p || path.startsWith(`${p}/`)) ||
  /^\/admin[-.]/.test(path); // admin-sw.js, admin.webmanifest, admin icons

function withNoIndex(res) {
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return out;
}

// ---------- Short links ----------
// /<slug> → its target (src/lib/shortLinkRules.js; Admin → Marketing →
// Tracked links). Only a single lowercase segment that isn't one of the
// site's own pages is looked up. The list is kept at the edge for a minute:
// a link made or changed in the admin works within that. A slug that isn't
// on the list carries on to the site (its 404).
const SHORT_LINKS_TTL_S = 60;

export async function shortLinkFor(url, env, ctx) {
  const m = url.pathname.match(/^\/([a-z0-9][a-z0-9-]{0,29})\/?$/i);
  const slug = m ? cleanSlug(m[1]) : '';
  if (!slug) return null;
  const links = await shortLinks(url, env, ctx);
  const target = links[slug];
  if (!target) return null;
  // A space in the target's query goes out as %20, never "+": some in-app
  // browsers (Instagram's, on some phones) keep a "+" as a "+".
  const [path, query] = target.split('?');
  const clean = query ? `${path}?${query.replace(/\+/g, '%20')}` : path;
  const res = Response.redirect(new URL(clean, url.origin).toString(), 302);
  const out = new Response(null, res);
  out.headers.set('cache-control', 'no-store');
  out.headers.set('X-Robots-Tag', 'noindex');
  return out;
}

async function shortLinks(url, env, ctx) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(`${url.origin}/__short_links`);
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) return hit.json().catch(() => ({}));
  }
  let value = null;
  try {
    const cfgRes = await env.ASSETS.fetch(new Request(new URL('/og-config.json', url)));
    const cfg = cfgRes.ok ? await cfgRes.json() : {};
    if (!cfg.url || !cfg.key) return cleanShortLinks(null);
    const res = await fetch(`${cfg.url}/rest/v1/site_settings?key=eq.short_links&select=value`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
    });
    if (!res.ok) return cleanShortLinks(null);
    const rows = await res.json();
    value = Array.isArray(rows) && rows[0] ? rows[0].value : null;
  } catch {
    return cleanShortLinks(null);
  }
  const links = cleanShortLinks(value);
  if (cache) {
    const stored = new Response(JSON.stringify(links), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${SHORT_LINKS_TTL_S}` },
    });
    const put = cache.put(key, stored).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(put);
  }
  return links;
}

const ADMIN_APP_HEAD = `
    <link rel="manifest" href="/admin.webmanifest" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="SUNDAY Admin" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
  </head>`;

async function adminApp(page) {
  const body = (await page.text())
    .replace(/<link rel="manifest"[^>]*>/, '')
    .replace('href="/apple-touch-icon.png"', 'href="/admin-apple-touch-icon.png"')
    .replace(/<title>[^<]*<\/title>/, '<title>SUNDAY Admin</title>')
    .replace('</head>', ADMIN_APP_HEAD);
  return new Response(body, page);
}

async function previewFor(url, env) {
  const product = url.pathname.match(/^\/product\/([^/]+)\/?$/);
  const lookbook = url.pathname.match(/^\/lookbook\/([^/]+)\/?$/);
  if (!product && !lookbook) return null;

  const cfgRes = await env.ASSETS.fetch(new Request(new URL('/og-config.json', url)));
  if (!cfgRes.ok) return null;
  const cfg = await cfgRes.json();
  if (!cfg.url || !cfg.key) return null;
  const rest = (path) =>
    fetch(`${cfg.url}/rest/v1/${path}`, { headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` } })
      .then((r) => (r.ok ? r.json() : []));

  if (product) {
    const id = decodeURIComponent(product[1]);
    const [p] = await rest(`products?id=eq.${encodeURIComponent(id)}&select=name,variant,price,description,images&limit=1`);
    if (!p) return null;
    const image = (p.images || []).find(Boolean);
    return {
      title: `${p.name}${p.variant ? ` — ${p.variant}` : ''} | SUNDAY`,
      description: [`Tk ${Number(p.price || 0).toLocaleString('en-IN')}`, clip(p.description, 150)].filter(Boolean).join(' · '),
      image: image && (await shareImage(absolute(image, url))),
      url: url.href,
    };
  }

  const drop = decodeURIComponent(lookbook[1]);
  const lookId = url.searchParams.get('look');
  const looks = lookId
    ? await rest(`lookbook_looks?id=eq.${encodeURIComponent(lookId)}&select=title,image_url,product_ids&limit=1`)
    : await rest(`lookbook_looks?drop_name=ilike.${encodeURIComponent(drop)}&active=eq.true&select=title,image_url,product_ids&order=sort_order.asc&limit=1`);
  const look = looks[0];
  if (!look) return { title: `${drop} — Lookbook | SUNDAY`, description: `The ${drop} lookbook from SUNDAY.`, url: url.href };

  // Name the pieces worn, for the preview's text.
  let pieces = '';
  const ids = (look.product_ids || []).slice(0, 4);
  if (ids.length) {
    const rows = await rest(`products?id=in.(${ids.map(encodeURIComponent).join(',')})&select=name`);
    pieces = rows.map((r) => r.name).join(', ');
  }
  return {
    title: `${look.title || 'The look'} — ${drop} | SUNDAY`,
    description: pieces ? `Shop the look: ${pieces}` : `From the ${drop} lookbook.`,
    image: look.image_url && (await shareImage(absolute(look.image_url, url))),
    url: url.href,
  };
}

// The small copy made at upload for previews (WhatsApp skips large images),
// when there is one; else the photo itself.
async function shareImage(src) {
  if (!/\/storage\/v1\/object\/public\//.test(src)) return src;
  const small = src.replace(/\.[a-z0-9]+(\?.*)?$/i, SHARE_SUFFIX);
  try {
    const head = await fetch(small, { method: 'HEAD' });
    if (head.ok) return small;
  } catch { /* fall through */ }
  return src;
}

function absolute(src, url) {
  return /^https?:/i.test(src) ? src : new URL(src, url.origin).href;
}

function clip(text, n) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

// Every other page: its own address as the one to index, in the first HTML
// a crawler gets (index.html says the homepage). src/lib/pageMeta.js keeps it
// right as the visitor moves around.
function withCanonical(page, url) {
  const own = url.origin + canonicalPath(url.pathname, url.search);
  return new HTMLRewriter()
    .on('link[rel="canonical"]', { element: (el) => el.setAttribute('href', own) })
    .on('meta[property="og:url"]', { element: (el) => el.setAttribute('content', own) })
    .transform(page);
}

function rewrite(page, meta) {
  const set = (value) => ({ element: (el) => { if (value) el.setAttribute('content', value); } });
  const drop = { element: (el) => el.remove() };
  return new HTMLRewriter()
    .on('title', { element: (el) => { el.setInnerContent(meta.title); } })
    .on('meta[name="description"]', set(meta.description))
    .on('meta[property="og:title"]', set(meta.title))
    .on('meta[property="og:description"]', set(meta.description))
    .on('meta[property="og:url"]', set(meta.url))
    .on('meta[property="og:type"]', set('product'))
    .on('meta[property="og:image"]', set(meta.image))
    .on('meta[name="twitter:title"]', set(meta.title))
    .on('meta[name="twitter:description"]', set(meta.description))
    .on('meta[name="twitter:image"]', set(meta.image))
    // The site-wide image's size and words don't describe this photo.
    .on('meta[property="og:image:width"]', meta.image ? drop : {})
    .on('meta[property="og:image:height"]', meta.image ? drop : {})
    .on('meta[property="og:image:alt"]', meta.image ? set(meta.title) : {})
    .on('link[rel="canonical"]', { element: (el) => el.setAttribute('href', meta.url) })
    .transform(page);
}
