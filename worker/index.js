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
  async fetch(request, env) {
    const url = new URL(request.url);
    const page = await env.ASSETS.fetch(request);
    if (request.method !== 'GET' || !(page.headers.get('content-type') || '').includes('text/html')) return page;
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return adminApp(page);

    try {
      const meta = await previewFor(url, env);
      return meta ? rewrite(page, meta) : page;
    } catch {
      return page; // a preview is never worth a broken page
    }
  },
};

const ADMIN_APP_HEAD = `
    <link rel="manifest" href="/admin.webmanifest" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="SUNDAY Admin" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
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
