// Inserts Cloudinary's automatic format/quality/width transformation into an
// existing Cloudinary delivery URL. Cuts image payload size significantly
// (auto picks WebP/AVIF where supported, compresses, and caps width) with no
// visible quality loss for product thumbnails/cards.
//
// Safe no-op for any URL that isn't a Cloudinary URL (e.g. during local dev
// before Cloudinary is configured), so it's fine to wrap every image with it.
export function cloudinaryOptimized(url, width = 600) {
  if (!url || typeof url !== 'string') return url;
  const marker = '/upload/';
  const i = url.indexOf(marker);
  if (!url.includes('res.cloudinary.com') || i === -1) return url;
  const before = url.slice(0, i + marker.length);
  const after = url.slice(i + marker.length);
  return `${before}f_auto,q_auto,w_${width}/${after}`;
}
