import { supabase } from '@/lib/supabaseClient'
import { getVisitAttribution } from '@/lib/attribution'

// sessionStorage, not localStorage — a "session" for traffic purposes is
// meant to reset when the tab closes, the way it does in any analytics tool,
// unlike the abandoned-cart id which deliberately persists.
const KEY = 'sunday_visit_session'

function getSessionId() {
  try {
    let id = sessionStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

// Phone, tablet or computer, by the screen and how it's touched — enough to
// tell where people shop from without a user-agent parser.
function deviceKind() {
  try {
    const touch = window.matchMedia('(pointer: coarse)').matches
    const w = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight)
    if (touch && w < 600) return 'mobile'
    if (touch) return 'tablet'
    return 'desktop'
  } catch {
    return null
  }
}

export async function trackPageView(path) {
  // The admin's own browsing while managing the store isn't a customer
  // visit — counting it would inflate traffic and wreck the conversion rate.
  if (path.startsWith('/admin')) return

  try {
    const row = {
      session_id: getSessionId(),
      path,
      referrer: document.referrer || null,
      device: deviceKind(),
    }
    // A visit that came in through a tracked link (or from inside Instagram,
    // Messenger or Facebook) keeps its source on every page view.
    const utm = getVisitAttribution()
    const withUtm = utm.utm_source
      ? { ...row, utm_source: utm.utm_source, utm_medium: utm.utm_medium || null, utm_campaign: utm.utm_campaign || null }
      : row
    const { error } = await supabase.from('page_views').insert(withUtm)
    // Before the columns exist, log the visit anyway.
    if (error && withUtm !== row && /utm_/.test(error.message || '')) {
      await supabase.from('page_views').insert(row)
    }
  } catch (err) {
    console.warn('[Analytics] trackPageView failed:', err.message)
  }
}
