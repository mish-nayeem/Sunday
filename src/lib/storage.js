// Product photos live in Supabase Storage — the public `images` bucket
// (see supabase/migrations/storage_images_bucket.sql). Only an admin can
// upload there (storage policies check public.is_admin()), so the browser
// uploads directly with the signed-in session; no secret key is involved.
import { supabase } from '@/lib/supabaseClient';

export const IMAGE_BUCKET = 'images';

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

// Uploads a File/Blob and returns its public URL to store in the DB.
// A random name means two photos called IMG_0001.jpg never collide.
export async function uploadImage(file, folder = 'products') {
  const ext = ((file.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    cacheControl: '31536000', // a path is never reused, so cache it for a year
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
