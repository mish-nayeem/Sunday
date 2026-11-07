import { useEffect, useRef, useState } from 'react'
import { parseFocus, formatFocus, MAX_ZOOM } from '../lib/focus.js'
import './focus-drag.css'

export { parseFocus }

const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n))

// A photo in the shape of the screen it's for, placed the way a Canva frame
// or a Facebook cover is: press and drag it until the part you want sits in
// the frame, then let go. With `zoom`, it can also be enlarged — the mouse
// wheel, two fingers on a phone, or the slider the page puts beside it — so
// a small photo, or a far-off subject, fills the frame. Saved as the photo's
// focus ("x% y%", or "x% y% zoom"; see lib/focus.js).
export default function FocusDrag({ src, value, zoom = false, disabled = false, className = '', liveHint = 'Let go to save', onChange, children }) {
  const frame = useRef(null)
  const img = useRef(null)
  const drag = useRef(null)
  const pointers = useRef(new Map())
  const pinch = useRef(null)
  const [live, setLive] = useState(null)
  const liveRef = useRef(null)
  const saved = parseFocus(value)
  const [x, y, z] = live || [saved[0], saved[1], zoom ? saved[2] : 1]

  function show(next) {
    liveRef.current = next
    setLive(next)
  }

  // How far the photo spills past the frame at this zoom — what dragging can
  // bring into view. object-fit: cover first scales it to just cover.
  function spill(atZoom) {
    const f = frame.current.getBoundingClientRect()
    const { naturalWidth: nw, naturalHeight: nh } = img.current
    const cover = Math.max(f.width / nw, f.height / nh)
    return [nw * cover * atZoom - f.width, nh * cover * atZoom - f.height]
  }

  function startDrag(px, py, from) {
    const [sx, sy] = spill(from[2])
    drag.current = { px, py, from, sx, sy }
  }

  function down(e) {
    if (disabled || !img.current?.naturalWidth) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, [e.clientX, e.clientY])
    const now = liveRef.current || [x, y, z]
    if (pointers.current.size === 2 && zoom) {
      const [[ax, ay], [bx, by]] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(ax - bx, ay - by) || 1, from: now }
      drag.current = null
    } else if (pointers.current.size === 1) {
      startDrag(e.clientX, e.clientY, now)
    }
    show(now)
  }

  function move(e) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, [e.clientX, e.clientY])
    if (pinch.current && pointers.current.size >= 2) {
      const [[ax, ay], [bx, by]] = [...pointers.current.values()]
      const p = pinch.current
      const nz = clamp(p.from[2] * (Math.hypot(ax - bx, ay - by) / p.dist), 1, MAX_ZOOM)
      show([p.from[0], p.from[1], nz])
      return
    }
    const d = drag.current
    if (!d) return
    // Dragging right shows more of the left, so the position goes down.
    const nx = d.sx > 0.5 ? clamp(d.from[0] - ((e.clientX - d.px) / d.sx) * 100) : d.from[0]
    const ny = d.sy > 0.5 ? clamp(d.from[1] - ((e.clientY - d.py) / d.sy) * 100) : d.from[1]
    show([nx, ny, d.from[2]])
  }

  function up(e) {
    pointers.current.delete(e.pointerId)
    const now = liveRef.current
    if (pointers.current.size === 1 && now) {
      // One finger left after a pinch: carry on dragging from here.
      pinch.current = null
      const [[px, py]] = [...pointers.current.values()]
      startDrag(px, py, now)
      return
    }
    if (pointers.current.size > 0) return
    drag.current = null
    pinch.current = null
    commit(now)
  }

  function commit(now) {
    liveRef.current = null
    setLive(null)
    if (!now) return
    const next = formatFocus(now[0], now[1], zoom ? now[2] : 1)
    if (next !== formatFocus(saved[0], saved[1], zoom ? saved[2] : 1)) onChange(next)
  }

  // The mouse wheel zooms. Listened to by hand: React's wheel listener is
  // passive, so it couldn't stop the page from scrolling instead.
  const wheelState = useRef({ timer: null })
  useEffect(() => {
    const el = frame.current
    if (!el || !zoom || disabled) return undefined
    function wheel(e) {
      if (!img.current?.naturalWidth) return
      e.preventDefault()
      const now = liveRef.current || [x, y, z]
      show([now[0], now[1], clamp(now[2] * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM)])
      clearTimeout(wheelState.current.timer)
      wheelState.current.timer = setTimeout(() => commit(liveRef.current), 250)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  })

  const hint = live ? liveHint : zoom ? '✥ Drag to move · scroll or pinch to zoom' : '✥ Drag to move'

  return (
    <div
      ref={frame}
      className={`focus-drag ${live ? 'dragging' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <img ref={img} src={src} alt="" draggable={false} style={{ objectPosition: `${x}% ${y}%`, scale: String(z), transformOrigin: `${x}% ${y}%` }} />
      {!disabled && <span className="focus-drag-hint mono">{hint}</span>}
      {children}
    </div>
  )
}
