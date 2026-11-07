import { supabase } from './supabaseClient.js'

// Storefront copy kept in the site_settings table (one row per key), so the
// admin can change it without a redeploy.

export async function fetchSetting(key) {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (error) {
    console.error('[Supabase] fetchSetting failed:', error.message)
    return { value: null, error }
  }
  return { value: data?.value ?? null, error: null }
}

export async function saveSetting(key, value) {
  const { error } = await supabase
    .from('site_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) console.error('[Supabase] saveSetting failed:', error.message)
  return { error }
}

// The homepage ticker's lines when none are saved (or the table isn't there).
export const DEFAULT_TICKER = [
  'Delivery all over Bangladesh. Cash on delivery inside Dhaka.',
]

// The lines saved in Admin → Homepage → Ticker; none means the strip is off.
export async function fetchTicker() {
  const { value } = await fetchSetting('ticker')
  return Array.isArray(value) ? value.map((l) => String(l).trim()).filter(Boolean) : []
}

// How fast the ticker runs, 1 (slow) to 10 (fast). Each step is the seconds
// one loop takes.
export const TICKER_SPEEDS = [90, 75, 62, 52, 40, 33, 27, 22, 17, 13]
export const DEFAULT_TICKER_SPEED = 5

export async function fetchTickerSpeed() {
  const { value } = await fetchSetting('ticker_speed')
  const n = Number(value)
  return n >= 1 && n <= TICKER_SPEEDS.length ? n : DEFAULT_TICKER_SPEED
}

// The homepage hero's button and its optional drop countdown — Admin →
// Homepage. Stored as site_settings 'hero_button' and 'hero_countdown'.
export const DEFAULT_HERO_BUTTON = { label: 'Shop now', link: '/shop' }

export async function fetchHeroExtras() {
  const [b, c] = await Promise.all([fetchSetting('hero_button'), fetchSetting('hero_countdown')])
  const button = b.value && typeof b.value === 'object' && b.value.label ? { ...DEFAULT_HERO_BUTTON, ...b.value } : DEFAULT_HERO_BUTTON
  const countdown = c.value && typeof c.value === 'object' && c.value.at ? c.value : null
  return { button, countdown, error: b.error || c.error }
}

// The footer's newsletter words — Admin → Homepage → Footer text. Stored as
// site_settings 'footer_about'. An empty box falls back to these.
export const DEFAULT_FOOTER_ABOUT = {
  heading: 'Newsletter',
  text: 'Get an email when new arrivals land. No more than a few a month.',
}

export async function fetchFooterAbout() {
  const { value } = await fetchSetting('footer_about')
  if (!value || typeof value !== 'object') return DEFAULT_FOOTER_ABOUT
  return {
    heading: String(value.heading ?? '').trim() || DEFAULT_FOOTER_ABOUT.heading,
    text: String(value.text ?? '').trim() || DEFAULT_FOOTER_ABOUT.text,
  }
}
