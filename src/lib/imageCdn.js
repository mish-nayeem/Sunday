// Photos through Cloudflare (the PAUSE way). On the shop's own domain,
// Supabase photos are resized and served by Cloudflare's image
// transformations: /cdn-cgi/image/<options>/<photo>. Cloudflare keeps each
// size at its edge, so Supabase hands a photo over once rather than once per
// visitor (the free plan's 5 GB of egress stays nearly untouched), and the
// browser gets AVIF/WebP at the size it shows.
//
// Off until the build variable VITE_IMAGE_CDN_HOST names the domain (for
// example sunday.com.bd) — set it only once Cloudflare → Images →
// Transformations is enabled for that zone with this Supabase project as an
// allowed source, or every photo there would break. Anywhere else (another
// address, local dev, a preview) the photos come as before.

const HOSTS = String(import.meta.env.VITE_IMAGE_CDN_HOST || '')
  .split(',')
  .map((h) => h.trim().toLowerCase().replace(/^www\./, ''))
  .filter(Boolean);

const SUPABASE_OBJECT = '/storage/v1/object/public/';

export function onImageCdn(url) {
  if (!HOSTS.length || typeof window === 'undefined') return false;
  if (typeof url !== 'string' || !url.includes(SUPABASE_OBJECT) || url.includes('?')) return false;
  return HOSTS.includes(window.location.hostname.toLowerCase().replace(/^www\./, ''));
}

export function cdnImage(url, { w, h, q } = {}) {
  const opts = [];
  if (w) opts.push(`width=${w}`);
  if (h) opts.push(`height=${h}`);
  opts.push(`quality=${q || 75}`, `fit=${w && h ? 'cover' : 'scale-down'}`, 'format=auto');
  return `/cdn-cgi/image/${opts.join(',')}/${url}`;
}
