import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// What scrolls: the content pane on a computer (it scrolls on its own,
// admin-theme.css), the page itself on a phone.
function pane() {
  const m = typeof document !== 'undefined' ? document.querySelector('.admin .main') : null
  if (m && /(auto|scroll)/.test(getComputedStyle(m).overflowY)) return m
  return null
}
const scrollTop = () => { const m = pane(); return m ? m.scrollTop : window.scrollY }
const scrollRoom = () => {
  const m = pane()
  return m ? m.scrollHeight - m.clientHeight : document.documentElement.scrollHeight - window.innerHeight
}
function jumpToY(y) {
  const m = pane()
  if (m) m.scrollTop = Math.max(0, y)
  else window.scrollTo(0, Math.max(0, y))
}

// The admin panel's sections, sub-tabs and open forms are page state, not
// separate addresses — so a phone's Back button used to leave the panel
// altogether. This keeps each step in the browser history instead: opening
// something adds an entry, Back (the phone's, the browser's or the panel's
// own) steps back one, and closing a form you just opened takes you back
// rather than piling up a new entry.
//
// Each step also remembers how far down the page was scrolled: Back puts the
// page back at that spot, wherever it was left.
//
// `view` is a plain object describing where the panel is; `apply(view)` puts
// the panel back there. Returns `depth` (how many steps in) and `back()`.
export default function useAdminHistory(view, apply) {
  const navigate = useNavigate()
  const location = useLocation()
  const key = JSON.stringify(view)
  const stack = useRef(null)
  const at = useRef(0)
  const current = useRef(key)
  current.current = key
  const applyRef = useRef(apply)
  applyRef.current = apply

  // How far down each step was scrolled, by its place in the history.
  const scrolled = useRef({})
  // A Back/Forward on its way: the step it lands on and where to scroll.
  const restore = useRef(null)
  // The view about to change (while rendering, before the page does): note
  // where this step was scrolled to. Not while a Back/Forward is landing —
  // that one was noted when it began.
  const seen = useRef(key)
  if (seen.current !== key) {
    if (!restore.current) scrolled.current[at.current] = scrollTop()
    seen.current = key
  }

  // The panel puts the scroll back itself; the browser's own guess would
  // land somewhere else.
  useEffect(() => {
    const was = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => { window.history.scrollRestoration = was }
  }, [])

  // First visit: this entry is the bottom of the panel's history.
  useEffect(() => {
    stack.current = [key]
    at.current = 0
    navigate(location.pathname + location.search, { replace: true, state: { adminAt: 0, adminView: key } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The panel moved somewhere new: one step forward — or, if it's where the
  // previous step was (a form closed), one step back.
  useEffect(() => {
    if (!stack.current || stack.current[at.current] === key) return
    if (at.current > 0 && stack.current[at.current - 1] === key) {
      navigate(-1)
      return
    }
    stack.current = [...stack.current.slice(0, at.current + 1), key]
    at.current += 1
    navigate(location.pathname + location.search, { state: { adminAt: at.current, adminView: key } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Back or Forward landed on one of the panel's entries: show that step.
  useEffect(() => {
    const st = location.state
    if (!st || typeof st.adminAt !== 'number' || !stack.current) return
    if (st.adminAt !== at.current) {
      // Leaving this step: remember where it was scrolled to, and where the
      // step we land on was.
      scrolled.current[at.current] = scrollTop()
      restore.current = { view: st.adminView, y: scrolled.current[st.adminAt] ?? null }
    }
    at.current = st.adminAt
    // After a reload the list of steps is gone; the entry still says where.
    if (!stack.current[st.adminAt]) stack.current[st.adminAt] = st.adminView
    if (st.adminView !== current.current) applyRef.current(JSON.parse(st.adminView))
    else if (restore.current) {
      // Same view (nothing to redraw): just scroll.
      const { y } = restore.current
      restore.current = null
      if (y != null) jumpToY(y)
    }
  }, [location.key, location.state])

  // Once the step a Back/Forward landed on is on screen, scroll it back to
  // where it was — retrying for a moment while its list fills in.
  useLayoutEffect(() => {
    const r = restore.current
    if (!r || r.view !== key) return undefined
    restore.current = null
    if (r.y == null) return undefined
    let tries = 0
    let frame = 0
    const put = () => {
      const room = scrollRoom()
      jumpToY(Math.min(r.y, Math.max(0, room)))
      if (room < r.y && tries++ < 60) frame = requestAnimationFrame(put)
    }
    put()
    return () => cancelAnimationFrame(frame)
  }, [key, location.key])

  return {
    // Steps back from the bottom entry — there's somewhere in the panel to
    // go back to.
    depth: typeof location.state?.adminAt === 'number' ? location.state.adminAt : 0,
    back: () => navigate(-1),
  }
}
