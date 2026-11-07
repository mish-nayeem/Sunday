// Captures the ?utm_* params off the link a customer clicked to land here,
// straight into localStorage — so it survives from that reel/story click all
// the way through browsing to checkout, however many pages later that is.
//
// Call captureAttribution() once, at app startup: a client-side route change
// never touches the address bar's query string, so there is nothing new to
// read on later navigations within the same visit.
//
// A click counts for ATTRIBUTION_DAYS: an order placed later than that,
// with no newer link clicked, counts as Direct. The last link clicked wins.

const KEY = 'sunday_attribution'
// This visit's own link, if it arrived through one — page views carry it,
// so a source's visits can be counted, not just its orders.
const VISIT_KEY = 'sunday_visit_utm'
const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
export const ATTRIBUTION_DAYS = 30

// The app whose own browser this page opened in, if it says so: Instagram
// (a DM, the bio, a story), Messenger, or Facebook. WhatsApp opens links in
// the phone's ordinary browser, so it can't be told apart this way — its
// share button tags the link instead (?s=whatsapp).
export function inAppSource(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/MessengerForiOS|MessengerLite|Orca-Android|FBAN\/Messenger|FB_IAB\/MESSENGER/i.test(ua)) return 'messenger'
  if (/FBAN|FBAV|FB_IAB|FB4A/i.test(ua)) return 'facebook'
  return null
}

export function captureAttribution() {
  const params = new URLSearchParams(window.location.search)
  const hasUtm = FIELDS.some((f) => params.has(f))
  // The product page's share menu tags its links short: ?s=whatsapp,
  // ?s=facebook, ?s=copy, ?s=share. Only on a product link, so no other
  // page's own ?s= is ever taken for one.
  const onProduct = window.location.pathname.startsWith('/product/')
  const shareTag = onProduct ? (params.get('s') || '').trim().toLowerCase() : ''
  const share = /^[a-z0-9-]{1,30}$/.test(shareTag) ? shareTag : ''
  const app = inAppSource()

  // Taken off the address bar once read, so the link someone copies from
  // there doesn't carry this visit's tag to the next person.
  if (onProduct && params.has('s')) {
    try {
      params.delete('s')
      const q = params.toString()
      window.history.replaceState(window.history.state, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash)
    } catch { /* the tag just stays in the address bar */ }
  }

  let attribution
  if (hasUtm) {
    attribution = { captured_at: Date.now() }
    FIELDS.forEach((f) => {
      const v = (params.get(f) || '').trim()
      attribution[f] = v ? v.toLowerCase() : null
    })
  } else if (share) {
    // A copied link or the phone's share sheet says nothing about where it
    // went; opened inside Instagram, Messenger or Facebook, that's where.
    const source = (share === 'copy' || share === 'share') && app ? app : share
    attribution = { captured_at: Date.now(), utm_source: source, utm_medium: 'share', utm_campaign: null, utm_content: null, utm_term: null }
  } else if (app) {
    // No tag at all, but opened inside one of those apps (a bio link, a DM
    // with a link typed by hand): still that app. Not over a click already
    // credited to that app (an Instagram ad keeps its campaign when the
    // page is reopened in Instagram), nor over one from the last hour.
    try {
      const before = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (before && (before.utm_source === app || Date.now() - (before.captured_at || 0) < 3600e3)) return
    } catch { /* nothing readable to keep */ }
    attribution = { captured_at: Date.now(), utm_source: app, utm_medium: 'in-app', utm_campaign: null, utm_content: null, utm_term: null }
  } else {
    // No tracked link on this load — leave whatever was captured earlier in
    // place, so browsing the site afterwards doesn't erase where they came from.
    return
  }

  try {
    localStorage.setItem(KEY, JSON.stringify(attribution))
  } catch {
    // Storage can be blocked (private mode, full quota) — the order still
    // goes through, just without attribution attached.
  }
  try {
    sessionStorage.setItem(VISIT_KEY, JSON.stringify(attribution))
  } catch { /* the visit just isn't counted under its source */ }
}

export function getAttribution() {
  try {
    const raw = localStorage.getItem(KEY)
    const a = raw ? JSON.parse(raw) : {}
    // Too old to credit (a link from before the 30 days) — or saved before
    // the date was kept, which is older still.
    if (!a.captured_at || Date.now() - a.captured_at > ATTRIBUTION_DAYS * 86400e3) return {}
    return a
  } catch {
    return {}
  }
}

// The link this visit arrived through, for page views; {} for a visit that
// didn't come through a tracked link.
export function getVisitAttribution() {
  try {
    const raw = sessionStorage.getItem(VISIT_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}
