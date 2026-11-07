import { supabase } from './supabaseClient.js'
import { fetchSetting, saveSetting } from './siteSettings.js'
import { fetchLiveSales } from './sales.js'

// The shop's promo banners — running sales and coupon boxes — all from
// site_settings, so no table of their own:
//
//   promo_boxes   [{ id, color, code, text, target, drop, product_id, on }]
//                 The five coupon boxes (Website → Banners). Written by hand
//                 because the coupons table is secret from visitors.
//   promo_places  { sale: [...], coupon: [...] }
//                 Where each kind shows: 'home', 'shop', 'cart'.
//
// A sale makes its own banner while it runs (Marketing → Sales).

export const BOX_COLORS = [
  { key: 'ink', label: 'Black', bg: '#141414', ink: '#FFFFFF' },
  { key: 'burgundy', label: 'Burgundy', bg: '#6D2932', ink: '#FFFFFF' },
  { key: 'coral', label: 'Coral', bg: '#FF7254', ink: '#FFFFFF' },
  { key: 'stone', label: 'Stone', bg: '#F1F0EE', ink: '#141414' },
  { key: 'sky', label: 'Blue', bg: '#3F7CFF', ink: '#FFFFFF' },
]

export const colorOf = (key) => BOX_COLORS.find((c) => c.key === key) || BOX_COLORS[0]

export const DEFAULT_BOXES = BOX_COLORS.map((c, i) => ({
  id: `box${i + 1}`,
  color: c.key,
  code: '',
  text: '',
  target: 'none', // none | drop | product
  drop: '',
  product_id: '',
  on: true,
}))

export const PLACES = [
  { key: 'home', label: 'Homepage' },
  { key: 'shop', label: 'Shop page' },
  { key: 'cart', label: 'Bag' },
]

export const DEFAULT_PLACES = {
  sale: ['home', 'shop', 'cart'],
  coupon: ['home', 'shop', 'cart'],
}

const dropLink = (name) => `/shop?drop=${encodeURIComponent(name)}`

export async function fetchBoxes() {
  const { value, error } = await fetchSetting('promo_boxes')
  if (!Array.isArray(value)) return { boxes: DEFAULT_BOXES, error }
  // Always five, in the saved order; a missing one comes back empty.
  const boxes = DEFAULT_BOXES.map((d, i) => ({ ...d, ...(value[i] || {}) }))
  return { boxes, error }
}

export async function fetchPlaces() {
  const { value, error } = await fetchSetting('promo_places')
  const places = { ...DEFAULT_PLACES }
  if (value && typeof value === 'object') for (const k of Object.keys(DEFAULT_PLACES)) if (Array.isArray(value[k])) places[k] = value[k]
  return { places, error }
}

// The few products a banner needs a photo of, without loading the catalog.
async function fetchThumbs(ids) {
  if (!ids.length) return {}
  const { data } = await supabase.from('products').select('id, name, images').in('id', ids)
  return Object.fromEntries((data || []).map((p) => [String(p.id), p]))
}

// Which of the boxes' codes checkout takes right now (live_coupon_boxes),
// or null when that can't be asked.
async function fetchLiveCodes() {
  try {
    const { data, error } = await supabase.rpc('live_coupon_boxes')
    if (error || !Array.isArray(data)) return null
    return new Set(data.map((c) => String(c).toUpperCase()))
  } catch {
    return null
  }
}

let cache = null
let cacheAt = 0

// Everything a page needs to draw its banners, in one go (kept a minute).
export async function fetchPromos() {
  if (cache && Date.now() - cacheAt < 60_000) return cache
  const [{ boxes: allBoxes }, { places }, sales, live] = await Promise.all([fetchBoxes(), fetchPlaces(), fetchLiveSales(), fetchLiveCodes()])
  // Only codes checkout takes right now: switched on, started, not ended,
  // not used up. Without the answer, the boxes' own on/off decides.
  const boxes = live ? allBoxes.filter((b) => live.has(String(b.code || '').trim().toUpperCase())) : allBoxes
  const ids = new Set()
  for (const s of sales) for (const id of s.product_ids || []) ids.add(String(id))
  for (const b of boxes) if (b.on && b.code && b.target === 'product' && b.product_id) ids.add(String(b.product_id))
  const thumbs = await fetchThumbs([...ids])
  cache = { boxes, places, sales, thumbs }
  cacheAt = Date.now()
  return cache
}

export function clearPromoCache() {
  cache = null
}

// Coupon boxes follow the coupons themselves (Marketing → Coupons): a box
// whose code was deleted is emptied, and one whose coupon is switched off
// stops showing — so the shop never shows a code checkout won't take.
export async function pruneCouponBoxes(coupons) {
  const { value } = await fetchSetting('promo_boxes')
  if (!Array.isArray(value)) return
  const all = new Map(coupons.map((c) => [String(c.code).trim().toUpperCase(), c]))
  let changed = false
  const next = value.map((b) => {
    const code = String(b?.code || '').trim().toUpperCase()
    if (!code) return b
    const c = all.get(code)
    if (!c) { changed = true; return { ...b, code: '', text: '', on: false } }
    if (!c.active && b.on) { changed = true; return { ...b, on: false } }
    return b
  })
  if (changed) {
    await saveSetting('promo_boxes', next)
    clearPromoCache()
  }
}

// The banner cards for one place, in order: sales, then coupons.
// Each card: { key, kind, title, sub, endsAt, image, link, code, color }.
export function promoCards(data, place, now = Date.now()) {
  if (!data) return []
  const { boxes, places, sales, thumbs } = data
  const cards = []
  const firstPhoto = (id) => thumbs[String(id)]?.images?.[0] || null

  if (places.sale.includes(place)) {
    for (const s of sales) {
      if (new Date(s.starts_at).getTime() > now || new Date(s.ends_at).getTime() <= now) continue
      const ids = s.product_ids || []
      let sub = 'On everything'
      let image = null
      let link = '/shop'
      if (s.drop_name) {
        sub = `On the ${s.drop_name} drop`
        link = dropLink(s.drop_name)
      } else if (ids.length) {
        sub = ids.length === 1 ? (thumbs[String(ids[0])]?.name || 'On one piece') : `On ${ids.length} pieces`
        image = firstPhoto(ids[0])
        if (ids.length === 1) link = `/product/${ids[0]}`
      }
      cards.push({ key: `sale-${s.id}`, kind: 'sale', title: `${s.name ? s.name + ' · ' : ''}${s.percent}% off`, sub, endsAt: s.ends_at, image, link })
    }
  }

  if (places.coupon.includes(place)) {
    for (const b of boxes) {
      if (!b.on || !String(b.code || '').trim()) continue
      let image = null
      let link = null
      if (b.target === 'drop' && b.drop) {
        link = dropLink(b.drop)
      } else if (b.target === 'product' && b.product_id) {
        image = firstPhoto(b.product_id)
        link = `/product/${b.product_id}`
      }
      cards.push({ key: `coupon-${b.id}`, kind: 'coupon', title: String(b.code).trim().toUpperCase(), sub: b.text || 'Use this code at checkout', image, link, code: String(b.code).trim().toUpperCase(), color: b.color })
    }
  }
  return cards
}
