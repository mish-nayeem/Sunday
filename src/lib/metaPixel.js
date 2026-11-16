import { supabase } from '@/lib/supabaseClient'

// Meta Pixel — tells Meta what shoppers do (page views, product views, adds
// to bag, checkout, purchases) so ads can be measured and aimed. The Pixel ID
// is set in Admin → Marketing → Setup guide (site_settings 'meta_pixel');
// with none saved nothing loads at all. The admin's own pages are never
// tracked.
//
// Meta's base code is an inline <script>, which the site's security policy
// (CSP) doesn't run; this is the same stub written as a module, with only
// connect.facebook.net allowed in (worker/security-headers.js).
//
// Every event is also sent from the server (supabase/functions/meta-capi —
// the Conversions API), which ad blockers and phone privacy settings can't
// stop. Both copies carry one event id, so Meta counts it once.

export const META_PIXEL_KEY = 'meta_pixel'

let ready = null

const onAdmin = () => typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')

export function loadPixel() {
  if (ready) return ready
  ready = supabase
    .from('site_settings')
    .select('value')
    .eq('key', META_PIXEL_KEY)
    .maybeSingle()
    .then(({ data }) => {
      const id = String(data?.value?.id || '').replace(/\D/g, '')
      if (!id || onAdmin() || typeof window === 'undefined') return null
      if (!window.fbq) {
        const fbq = function fbqStub(...args) {
          if (fbq.callMethod) fbq.callMethod(...args)
          else fbq.queue.push(args)
        }
        window.fbq = fbq
        if (!window._fbq) window._fbq = fbq
        fbq.push = fbq
        fbq.loaded = true
        fbq.version = '2.0'
        fbq.queue = []
        const s = document.createElement('script')
        s.async = true
        s.src = 'https://connect.facebook.net/en_US/fbevents.js'
        document.head.appendChild(s)
      }
      // The Pixel also sends a PageView by itself whenever the address
      // changes (pushState); the router's own PageView is the one that
      // counts, so that's switched off — or every page would count twice.
      window.fbq.disablePushState = true
      window.fbq('init', id)
      return id
    })
    .catch(() => null)
  return ready
}

// One standard event, from the browser (the Pixel) and from the server
// (meta-capi), under one event id so Meta counts it once. A Purchase's server
// copy is sent by the checkout itself (it carries the order number, which the
// server reads the order back from).
export async function metaTrack(event, params = {}, eventId) {
  if (onAdmin()) return
  const id = await loadPixel()
  if (!id || !window.fbq || onAdmin()) return
  const eid = String(eventId || newEventId())
  window.fbq('track', event, params, { eventID: eid })
  if (event !== 'Purchase') {
    supabase.functions
      .invoke('meta-capi', { body: { event, event_id: eid, url: window.location.href, custom_data: params, ...metaCookies() } })
      .catch(() => {})
  }
}

function newEventId() {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

// The browser and click ids the Pixel keeps in cookies — sent along with the
// server's purchase so Meta can tie it to the same person and ad click.
export function metaCookies() {
  const get = (name) => {
    const hit = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ''
  }
  return { fbp: get('_fbp'), fbc: get('_fbc') }
}

// A cart line or product → Meta's contents shape.
export const metaContents = (lines) =>
  lines.map((l) => ({ id: String(l.productId ?? l.id ?? l.product_id), quantity: Number(l.quantity ?? l.qty ?? 1), item_price: Number(l.price) || 0 }))
