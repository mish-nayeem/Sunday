// The address a page asks Google to index it under. Shared by the site
// (src/lib/pageMeta.js, after every move) and worker/index.js (the first
// HTML a crawler gets) — change one, change both by changing this.
//
// The path without a trailing slash and without any query, except on the
// shop: its category (?category=) or its drop (?drop=), so each category
// and drop is a page of its own in Google rather than a copy of /shop.
// Sorting, filters, search, page numbers and tracking tags are left off.
export function canonicalPath(pathname, search = '') {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (path !== '/shop') return path;
  const q = new URLSearchParams(search);
  const drop = (q.get('drop') || '').trim();
  const category = (q.get('category') || '').trim();
  if (drop) return `${path}?drop=${encodeURIComponent(drop)}`;
  if (category && category.toLowerCase() !== 'all') return `${path}?category=${encodeURIComponent(category)}`;
  return path;
}
