// A photo's place in its card, as the admin set it (✥ Adjust):
//   "x% y%"        — which part of the photo sits in the frame
//   "x% y% zoom"   — the same, enlarged (1 = just filling the frame, up to 4)
// The site shows it with object-fit: cover at that position, scaled around
// that same point — so however far it's zoomed or moved, the photo always
// covers the frame, with no empty edges.

// The old arrow choices, read as positions so a photo saved with one opens
// where it was.
const WORDS = {
  center: [50, 50],
  top: [50, 0],
  bottom: [50, 100],
  left: [0, 50],
  right: [100, 50],
}

export const MAX_ZOOM = 4

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

// → [x, y, zoom]
export function parseFocus(value) {
  if (!value) return [50, 50, 1]
  if (WORDS[value]) return [...WORDS[value], 1]
  const m = String(value).match(/^(-?[\d.]+)%\s+(-?[\d.]+)%(?:\s+([\d.]+))?$/)
  if (!m) return [50, 50, 1]
  return [clamp(Number(m[1]), 0, 100), clamp(Number(m[2]), 0, 100), clamp(Number(m[3] || 1), 1, MAX_ZOOM)]
}

export function formatFocus(x, y, zoom = 1) {
  const z = Math.round(clamp(zoom, 1, MAX_ZOOM) * 100) / 100
  const base = `${Math.round(clamp(x, 0, 100))}% ${Math.round(clamp(y, 0, 100))}%`
  return z > 1 ? `${base} ${z}` : base
}

// The style for an <img> with object-fit: cover inside an overflow-hidden
// frame. Scaling around the focus point keeps that point where it is, and a
// point inside the photo can never bring an edge of it into the frame.
export function focusStyle(value) {
  const [x, y, z] = parseFocus(value)
  const style = { objectPosition: `${x}% ${y}%` }
  if (z > 1) {
    style.scale = String(z)
    style.transformOrigin = `${x}% ${y}%`
  }
  return style
}

// How far a photo is zoomed (1 when it isn't), so the page can ask for a
// bigger copy of it and keep it sharp.
export function focusZoom(value) {
  return value ? parseFocus(value)[2] : 1
}
