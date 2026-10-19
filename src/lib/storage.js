// Product photos live in Supabase Storage — the public `images` bucket.
// Uploads happen in the admin panel (src/admin/lib/images.js); the storefront
// only reads them, sized for where they show.

const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

// Supabase's on-the-fly resizing is a paid-plan feature, so it stays off
// unless VITE_SUPABASE_IMAGE_TRANSFORM=true. Without it the original is
// served — uploads are already compressed to ~1600px JPEG in the browser.
const TRANSFORM = import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORM === 'true';

// Returns a URL for roughly `width` px wide. Any other URL (old links,
// placeholders) passes through untouched.
export function imgUrl(url, width) {
  if (!TRANSFORM || typeof url !== 'string' || !url.includes(OBJECT_PATH) || url.includes('?')) return url;
  const params = new URLSearchParams({ quality: '75', resize: 'contain' });
  if (width) params.set('width', String(width));
  return url.replace(OBJECT_PATH, RENDER_PATH) + '?' + params;
}
