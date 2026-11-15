import { fetchSetting } from './siteSettings.js'
import { dropKey } from './lookbook.js'

// The homepage's drop countdown (Admin → Website → Homepage → Drop countdown), kept in
// site_settings 'hero_countdown' as
//
//   { label, at, drop?, pos?: { pc?: {x, y}, phone?: {x, y} }, size?: { pc?, phone? } }
//
// With a drop named, the clock runs to that drop's launch time — the one set
// in Products → Collections (drop_banners[<drop>].launch_at) — read fresh
// each time, so moving the drop's time moves the clock with it. `at` is the
// time as it was when saved, used only if the drop no longer has one.
// `pos` is where the clock sits on the hero, in % of its width and height
// (the centre of the clock), on a PC and on a phone apart; none = above the
// hero button, as before. `size` scales the clock (1 = as designed, 0.6–2.5),
// again on a PC and on a phone apart.

const EDGE = 6

function point(p) {
  const x = Number(p?.x)
  const y = Number(p?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const clamp = (n) => Math.round(Math.min(100 - EDGE, Math.max(EDGE, n)) * 10) / 10
  return { x: clamp(x), y: clamp(y) }
}

export function cleanPos(pos) {
  const out = {}
  const pc = point(pos?.pc)
  const phone = point(pos?.phone)
  if (pc) out.pc = pc
  if (phone) out.phone = phone
  return out
}

export const MIN_SIZE = 0.6
export const MAX_SIZE = 2.5

export function cleanSize(size) {
  const out = {}
  for (const d of ['pc', 'phone']) {
    const n = Number(size?.[d])
    if (!Number.isFinite(n) || n <= 0) continue
    const v = Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, n)) * 100) / 100
    if (v !== 1) out[d] = v
  }
  return out
}

// The countdown to show, or null: the drop's launch time when one is named
// and set, else the saved time.
export function countdownFrom(raw, banners = {}) {
  if (!raw || typeof raw !== 'object') return null
  const drop = typeof raw.drop === 'string' ? raw.drop.trim() : ''
  const dropAt = drop ? banners?.[dropKey(drop)]?.launch_at : null
  const at = dropAt || raw.at || ''
  if (!at || Number.isNaN(new Date(at).getTime())) return null
  return { label: String(raw.label || 'NEXT DROP'), at, drop, pos: cleanPos(raw.pos), size: cleanSize(raw.size) }
}

export async function fetchHeroCountdown() {
  const { value } = await fetchSetting('hero_countdown')
  if (!value || typeof value !== 'object') return null
  const banners = value.drop ? (await fetchSetting('drop_banners')).value || {} : {}
  return countdownFrom(value, banners)
}

// A placed clock that would run past the hero's edge (big, near a side) is
// nudged back in, keeping `pad` px clear. Uses the `translate` property, so
// the element's own transform (its centring) is left alone.
export function keepInside(el, pad = 12) {
  const box = el?.offsetParent?.getBoundingClientRect()
  if (!box) return
  el.style.translate = ''
  const r = el.getBoundingClientRect()
  let dx = 0
  let dy = 0
  if (r.width + pad * 2 >= box.width) dx = box.left + box.width / 2 - (r.left + r.width / 2)
  else if (r.left < box.left + pad) dx = box.left + pad - r.left
  else if (r.right > box.right - pad) dx = box.right - pad - r.right
  if (r.top < box.top + pad) dy = box.top + pad - r.top
  else if (r.bottom > box.bottom - pad) dy = box.bottom - pad - r.bottom
  if (dx || dy) el.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`
}
