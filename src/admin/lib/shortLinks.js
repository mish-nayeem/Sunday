import { fetchSetting, saveSetting } from './siteSettings.js'
import { cleanShortLinks, cleanSlug, cleanTarget } from '../../lib/shortLinkRules.js'

// Admin → Marketing → Tracked links → Short links (see shortLinkRules.js).
export const SHORT_LINKS_KEY = 'short_links'

export async function fetchShortLinks() {
  const { value, error } = await fetchSetting(SHORT_LINKS_KEY)
  return { links: cleanShortLinks(value), error }
}

// One link added, changed (target) or removed (null). Read fresh first and
// change only that one, so an admin open in two places never writes an
// older list back over a newer one.
export async function saveShortLink(slug, target) {
  const s = cleanSlug(slug)
  if (!s) return { error: 'BAD_SLUG' }
  // A link made on this page is an address on this same site: its path.
  let path = target
  if (target != null) {
    try {
      const u = new URL(target, window.location.origin)
      if (u.origin === window.location.origin) path = u.pathname + u.search
    } catch { /* not an address — cleanTarget says no */ }
  }
  const t = target == null ? null : cleanTarget(path)
  if (target != null && !t) return { error: 'BAD_TARGET' }
  const { value, error } = await fetchSetting(SHORT_LINKS_KEY)
  if (error) return { error: 'READ_FAILED' }
  const links = cleanShortLinks(value)
  if (t) links[s] = t
  else delete links[s]
  const saved = await saveSetting(SHORT_LINKS_KEY, links)
  return { links, error: saved.error ? 'SAVE_FAILED' : null }
}
