import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { imgUrl, uploadImage } from '../lib/images.js'
import {
  fetchAllHeroSlides,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  reorderHeroSlides,
  slidesFor,
  isVideo,
} from '../lib/hero.js'
import { fetchHeroExtras, saveSetting, fetchSetting, DEFAULT_HERO_BUTTON, DEFAULT_FOOTER_ABOUT } from '../lib/siteSettings.js'
import useDraft from '../lib/useDraft.js'
import DraftNote from './DraftNote.jsx'
import { useCountdown } from './DropCountdown.jsx'
import { cleanPos, cleanSize, keepInside, MIN_SIZE, MAX_SIZE } from '../lib/heroCountdown.js'
import { fetchDropBanners } from '../lib/promos.js'
import { dropKey } from '../lib/lookbook.js'
import { launchLabel } from '../lib/schedule.js'
import InfoTip from './InfoTip.jsx'
import FocusPicker from './FocusPicker.jsx'
import FocusDrag from './FocusDrag.jsx'
import { parseFocus, formatFocus, focusStyle, MAX_ZOOM } from '../lib/focus.js'
import FeatureManager from './FeatureManager.jsx'
import SharePreviewsBox from './SharePreviewsBox.jsx'
import { IconX } from './Icons.jsx'
import './hero-manager.css'

const DEVICES = [
  ['desktop', 'PC / laptop / tablet', 'Wide photo, about 2400 × 1350 px (16:9).'],
  ['mobile', 'Phones', 'Tall photo, about 1080 × 1920 px (9:16).'],
]

// Admin → Homepage. Everything the homepage shows, in boxes: the hero photos
// (PC and phone apart, each in its real shape), the button on the hero, an
// optional drop countdown — and a live preview of all of it on
// a phone and a laptop.
export default function HeroManager({ drops = [], products = [] }) {
  const [slides, setSlides] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  const [button, setButton] = useState(DEFAULT_HERO_BUTTON)
  // The drop countdown: its words, and either a drop (its launch time from
  // Products → Collections) or a time typed here; pos / size = where it sits
  // on the hero and how big, PC and phone apart (../lib/heroCountdown.js).
  const [countdown, setCountdown] = useState({ label: 'NEXT DROP', at: '', drop: '', pos: {}, size: {} })
  // Each collection's launch time, by dropKey (site_settings drop_banners).
  const [dropTimes, setDropTimes] = useState({})
  const [saved, setSaved] = useState({ button: '', countdown: '', footer: '' })
  const [footer, setFooter] = useState({ heading: '', text: '' })
  const [note, setNote] = useState({})

  async function load() {
    setLoading(true)
    const { slides, error } = await fetchAllHeroSlides()
    if (error) setError("Couldn't load hero slides. Did you run the hero SQL?")
    setSlides(slides)
    setLoading(false)
  }

  useEffect(() => {
    load()
    fetchHeroExtras().then(({ button }) => {
      setButton(button)
      setSaved((s) => ({ ...s, button: JSON.stringify(button) }))
    })
    Promise.all([fetchSetting('hero_countdown'), fetchDropBanners()]).then(([{ value }, { banners }]) => {
      const times = {}
      for (const [k, b] of Object.entries(banners || {})) if (b?.launch_at) times[k] = b.launch_at
      setDropTimes(times)
      const raw = value && typeof value === 'object' && (value.at || value.drop) ? value : null
      const cd = {
        label: raw?.label || 'NEXT DROP',
        at: raw && !raw.drop ? toLocal(raw.at) : '',
        drop: raw?.drop || '',
        pos: cleanPos(raw?.pos),
        size: cleanSize(raw?.size),
      }
      setCountdown(cd)
      setSaved((s) => ({ ...s, countdown: JSON.stringify(cd) }))
    })
    fetchSetting('footer_about').then(({ value }) => {
      const f = { heading: String(value?.heading ?? ''), text: String(value?.text ?? '') }
      setFooter(f)
      setSaved((s) => ({ ...s, footer: JSON.stringify(f) }))
    })
  }, [])

  // The footer words stay in this browser until saved.
  const keptFooter = useDraft('footer:about', footer, setFooter, { enabled: saved.footer !== '' })

  async function saveFooter() {
    const clean = { heading: footer.heading.trim(), text: footer.text.trim() }
    const { error } = await saveSetting('footer_about', clean)
    setFooter(clean)
    setNote((n) => ({ ...n, footer: error ? "Couldn't save — try again." : 'Saved — live in the footer.' }))
    if (!error) { setSaved((s) => ({ ...s, footer: JSON.stringify(clean) })); keptFooter.saved(clean) }
  }

  async function upload(file, device) {
    setBusy(true)
    setError('')
    try {
      if (file.type.startsWith('video/') && file.size > 50 * 1024 * 1024) {
        throw new Error('That video is over 50 MB. Export it smaller (1080p, about 15–30 seconds) and try again.')
      }
      const url = await uploadImage(file, supabase, 'hero')
      const label = (file.name || 'Slide').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').toUpperCase().slice(0, 40)
      const { error: createError } = await createHeroSlide({
        label,
        imageUrl: url,
        sortOrder: slides.length,
        device,
      })
      if (createError) throw new Error('Could not save the slide')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function patch(slide, fields) {
    setSlides((prev) => prev.map((s) => (s.id === slide.id ? { ...s, ...fields } : s)))
    setBusy(true)
    await updateHeroSlide(slide.id, fields)
    await load()
    setBusy(false)
  }

  // Up or down among the slides of the same screen; the saved order is the
  // one list, so the swap is with that neighbour in it.
  async function move(group, index, dir) {
    const a = group[index]
    const b = group[index + dir]
    if (!a || !b) return
    const next = [...slides]
    const ia = next.findIndex((s) => s.id === a.id)
    const ib = next.findIndex((s) => s.id === b.id)
    ;[next[ia], next[ib]] = [next[ib], next[ia]]
    setSlides(next)
    setBusy(true)
    await reorderHeroSlides(next)
    await load()
    setBusy(false)
  }

  async function remove(id) {
    setBusy(true)
    await deleteHeroSlide(id)
    setConfirmId(null)
    await load()
    setBusy(false)
  }

  async function saveButton() {
    const clean = { label: (button.label || '').trim().toUpperCase() || DEFAULT_HERO_BUTTON.label, link: (button.link || '').trim() || '/shop' }
    const { error } = await saveSetting('hero_button', clean)
    setButton(clean)
    setNote((n) => ({ ...n, button: error ? "Couldn't save — try again." : 'Saved — live on the homepage.' }))
    if (!error) setSaved((s) => ({ ...s, button: JSON.stringify(clean) }))
  }

  // A drop's launch time, if it's still ahead.
  function launchFor(drop) {
    const at = drop ? dropTimes[dropKey(drop)] : null
    return at && new Date(at).getTime() > Date.now() ? at : null
  }
  // What the clock runs to: the chosen drop's launch, or the time typed in.
  const countdownAt = countdown.drop ? launchFor(countdown.drop) || '' : countdown.at

  // Picking a drop names it in the words too, unless they were written by hand.
  function pickDrop(drop) {
    const auto = !countdown.label || /^NEXT DROP( · .*)?$/i.test(countdown.label.trim())
    setCountdown({ ...countdown, drop, label: auto ? (drop ? `NEXT DROP · ${drop}` : 'NEXT DROP') : countdown.label })
    setNote({})
  }

  function moveCountdown(device, p) {
    setCountdown((c) => ({ ...c, pos: cleanPos({ ...c.pos, [device]: p }) }))
    setNote({})
  }

  function sizeCountdown(device, n) {
    setCountdown((c) => ({ ...c, size: cleanSize({ ...c.size, [device]: n }) }))
    setNote({})
  }

  async function saveCountdown(clear = false) {
    const cd = clear ? { ...countdown, at: '', drop: '' } : countdown
    const at = clear ? '' : countdownAt
    const pos = cleanPos(cd.pos)
    const size = cleanSize(cd.size)
    const value = at
      ? {
          label: (cd.label || 'NEXT DROP').trim().toUpperCase(),
          at: new Date(at).toISOString(),
          ...(cd.drop ? { drop: cd.drop } : {}),
          ...(Object.keys(pos).length ? { pos } : {}),
          ...(Object.keys(size).length ? { size } : {}),
        }
      : {}
    const { error } = await saveSetting('hero_countdown', value)
    if (clear) setCountdown(cd)
    setNote((n) => ({ ...n, countdown: error ? "Couldn't save — try again." : at ? 'Saved — counting down on the homepage.' : 'Countdown off.' }))
    if (!error) setSaved((s) => ({ ...s, countdown: JSON.stringify(cd) }))
  }

  const groups = useMemo(
    () => ({
      desktop: slides.filter((s) => !s.device || s.device === 'all' || s.device === 'desktop'),
      mobile: slides.filter((s) => !s.device || s.device === 'all' || s.device === 'mobile'),
    }),
    [slides]
  )

  const linkChoices = [
    ['/shop', 'Shop · everything'],
    ['/shop?filter=new_arrival', 'Shop · new arrivals'],
    ...drops.map((d) => [`/lookbook/${encodeURIComponent(d)}`, `Lookbook · ${d}`]),
  ]

  return (
    <div className="hm">
      {error && <div className="err-banner mono">{error}</div>}

      {/* ---- Preview ---- */}
      <Box
        title="PREVIEW"
        tip="How the top of the homepage looks right now, with the photos rotating as they do on the site. It follows your changes as you make them — the button and countdown show here before you save, so check, then save."
        wide
      >
        <Preview slides={slides} button={button} countdown={{ ...countdown, at: countdownAt }} onMoveCountdown={moveCountdown} onSizeCountdown={sizeCountdown} />
      </Box>

      {/* ---- Hero photos, one box per kind of screen ---- */}
      {DEVICES.map(([device, title, size]) => {
        const list = groups[device]
        const own = list.filter((s) => s.device === device).length
        return (
          <Box
            key={device}
            title={`HERO PHOTOS · ${title.toUpperCase()}`}
            wide
            tip={
              <>
                <p>The full-screen photos or videos at the top of the homepage, under the see-through header. Photos rotate every 5 seconds, in this order; a video plays to its end, then the next one comes.</p>
                <p><b>Video:</b> MP4, under 50 MB — about 15–30 seconds at 1080p. It starts muted (browsers only autoplay muted); visitors can turn the sound on with the speaker button.</p>
                <p><b>Size:</b> {size} A photo of another shape is cropped to fill the screen — pick which part stays in frame under each photo.</p>
                <p>{device === 'mobile' ? 'If no photo is set for phones, the PC photos are used there too.' : 'If no photo is set for PCs, the phone photos are used there too.'} A photo set to Both shows on every screen.</p>
              </>
            }
          >
            {own === 0 && list.length > 0 && (
              <div className="hm-hint mono">None of its own yet — showing the {device === 'mobile' ? 'PC' : 'phone'} photos marked Both.</div>
            )}
            <div className={`hm-grid ${device}`}>
              {list.map((s, i) => (
                <SlideCard
                  key={s.id}
                  s={s}
                  device={device}
                  first={i === 0}
                  last={i === list.length - 1}
                  busy={busy}
                  confirm={confirmId === s.id}
                  onMove={(dir) => move(list, i, dir)}
                  onPatch={(f) => patch(s, f)}
                  onAskDelete={() => setConfirmId(s.id)}
                  onCancelDelete={() => setConfirmId(null)}
                  onDelete={() => remove(s.id)}
                />
              ))}
              <label className={`hm-add-card mono ${device} ${busy ? 'busy' : ''}`}>
                <span>{busy ? 'Working…' : `+ Add a photo or video for ${device === 'mobile' ? 'phones' : 'PC'}`}</span>
                <em>{size}</em>
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) upload(f, device)
                  }}
                />
              </label>
            </div>
            {!loading && list.length === 0 && <div className="empty mono">No photos yet — the homepage shows a plain background.</div>}
          </Box>
        )
      })}

      {/* ---- Drop sections under the hero ---- */}
      <FeatureManager drops={drops} products={products} />

      {/* ---- Button ---- */}
      <Box title="HERO BUTTON" tip="The SHOP NOW button in the middle of the main hero (orange outline). It opens every product (/shop) unless you point it somewhere else — e.g. a new drop while it's fresh, then back to Shop · everything.">
        <label className="pf-field">
          <span className="hm-flabel mono">TEXT</span>
          <input value={button.label} maxLength={28} onChange={(e) => { setButton({ ...button, label: e.target.value }); setNote({}) }} placeholder="SHOP NOW" />
        </label>
        <label className="pf-field">
          <span className="hm-flabel mono">GOES TO</span>
          <select
            value={linkChoices.some(([v]) => v === button.link) ? button.link : 'custom'}
            onChange={(e) => { if (e.target.value !== 'custom') setButton({ ...button, link: e.target.value }); setNote({}) }}
          >
            {linkChoices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            <option value="custom">Another page or link…</option>
          </select>
        </label>
        {!linkChoices.some(([v]) => v === button.link) && (
          <label className="pf-field">
            <span className="hm-flabel mono">LINK<InfoTip>A page on the site starting with /, e.g. /product/pc0006791 — or a full https:// link, which opens in a new tab.</InfoTip></span>
            <input value={button.link} onChange={(e) => { setButton({ ...button, link: e.target.value }); setNote({}) }} placeholder="/shop" />
          </label>
        )}
        <div className="hm-actions">
          <button type="button" className="courier-btn mono" onClick={saveButton} disabled={JSON.stringify(button) === saved.button}>Save button</button>
          {note.button && <span className="hm-note mono">{note.button}</span>}
        </div>
      </Box>

      {/* ---- Countdown ---- */}
      <Box title="DROP COUNTDOWN" tip="A countdown on the hero — NEXT DROP · CITYBOY IN 2D 04:12:09 — to build up a launch. Pick a drop and the clock runs to the launch time set in Products → Collections; change the drop's time there and the clock follows. Drag the clock in the previews above to place it, and its corner to make it bigger or smaller. It disappears by itself the moment the time passes.">
        <label className="pf-field">
          <span className="hm-flabel mono">TEXT ABOVE THE CLOCK</span>
          <input value={countdown.label} maxLength={32} onChange={(e) => { setCountdown({ ...countdown, label: e.target.value }); setNote({}) }} placeholder="NEXT DROP · CITYBOY" />
        </label>
        <label className="pf-field">
          <span className="hm-flabel mono">COUNTS DOWN TO</span>
          <select value={countdown.drop} onChange={(e) => pickDrop(e.target.value)}>
            <option value="">A time I set here</option>
            {countdown.drop && !drops.some((d) => dropKey(d) === dropKey(countdown.drop)) && (
              <option value={countdown.drop}>{countdown.drop}</option>
            )}
            {drops.map((d) => {
              const at = launchFor(d)
              return (
                <option key={d} value={d} disabled={!at}>
                  {d} — {at ? `live ${launchLabel(at)}` : 'no launch time yet'}
                </option>
              )
            })}
          </select>
        </label>
        {countdown.drop ? (
          <div className="hm-cd-hint mono">
            {countdownAt
              ? `Runs to ${countdown.drop}'s launch, ${launchLabel(countdownAt)}. Change that time in Products → Collections → ${countdown.drop}.`
              : `${countdown.drop} has no launch time ahead — set one in Products → Collections → ${countdown.drop}.`}
          </div>
        ) : (
          <label className="pf-field">
            <span className="hm-flabel mono">TIME</span>
            <input type="datetime-local" value={countdown.at} onChange={(e) => { setCountdown({ ...countdown, at: e.target.value }); setNote({}) }} />
          </label>
        )}
        <div className="hm-cd-hint mono">
          {Object.keys(countdown.pos || {}).length
            ? 'Placed where you dragged it in the previews above.'
            : 'Above the hero button. Drag the clock in the previews above to place it anywhere, and its corner to make it bigger or smaller — PC and phone apart.'}
          {Object.keys(countdown.pos || {}).length > 0 && (
            <button type="button" className="hm-link mono" onClick={() => { setCountdown({ ...countdown, pos: {} }); setNote({}) }}>Put it back above the button</button>
          )}
        </div>
        {/* How big the clock is: PC and phone apart. Also by the corner
            handle on the clock in the previews. */}
        <div className="hm-cd-sizes">
          {[['pc', 'SIZE · PC'], ['phone', 'SIZE · PHONE']].map(([d, name]) => {
            const v = countdown.size?.[d] || 1
            return (
              <label key={d} className="hm-cd-size">
                <span className="hm-flabel mono">{name}</span>
                <input type="range" min={MIN_SIZE} max={MAX_SIZE} step="0.05" value={v} onChange={(e) => sizeCountdown(d, Number(e.target.value))} />
                <span className="mono hm-cd-size-val">{Math.round(v * 100)}%</span>
              </label>
            )
          })}
          {Object.keys(countdown.size || {}).length > 0 && (
            <button type="button" className="hm-link mono" onClick={() => { setCountdown({ ...countdown, size: {} }); setNote({}) }}>Normal size</button>
          )}
        </div>
        <div className="hm-actions">
          <button type="button" className="courier-btn mono" onClick={() => saveCountdown(false)} disabled={!countdownAt || JSON.stringify(countdown) === saved.countdown}>Save countdown</button>
          {(countdown.drop || countdown.at) && <button type="button" className="courier-btn ghost mono" onClick={() => saveCountdown(true)}>Turn off</button>}
          {note.countdown && <span className="hm-note mono">{note.countdown}</span>}
        </div>
      </Box>

      {/* ---- Footer text ---- */}
      <Box
        title="FOOTER TEXT"
        wide
        tip="The words at the bottom of every page, over the email sign-up: a heading and a line under it. Leave a box empty to go back to the built-in words."
      >
        <DraftNote draft={keptFooter} />
        <label className="pf-field">
          <span className="hm-flabel mono">HEADING</span>
          <input value={footer.heading} maxLength={40} onChange={(e) => { setFooter({ ...footer, heading: e.target.value }); setNote({}) }} placeholder={DEFAULT_FOOTER_ABOUT.heading} />
        </label>
        <label className="pf-field">
          <span className="hm-flabel mono">TEXT</span>
          <textarea rows={3} value={footer.text} maxLength={400} onChange={(e) => { setFooter({ ...footer, text: e.target.value }); setNote({}) }} placeholder={DEFAULT_FOOTER_ABOUT.text} />
        </label>
        <div className="hm-foot-preview">
          <b>{footer.heading.trim() || DEFAULT_FOOTER_ABOUT.heading}</b>
          <p>{footer.text.trim() || DEFAULT_FOOTER_ABOUT.text}</p>
        </div>
        <div className="hm-actions">
          <button type="button" className="courier-btn mono" onClick={saveFooter} disabled={JSON.stringify(footer) === saved.footer}>Save footer text</button>
          {note.footer && <span className="hm-note mono">{note.footer}</span>}
        </div>
      </Box>

      {/* ---- Link previews for shared links ---- */}
      <SharePreviewsBox />
    </div>
  )
}

function toLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function Box({ title, tip, wide = false, children }) {
  return (
    <section className={`hm-box ${wide ? 'wide' : ''}`}>
      <div className="hm-box-head">
        <span className="hm-box-title mono">{title}</span>
        {tip && <InfoTip>{tip}</InfoTip>}
      </div>
      {children}
    </section>
  )
}

// One hero photo, shown in the shape of the screen it's for and cropped the
// way the site will crop it, with its settings under it.
function SlideCard({ s, device, first, last, busy, confirm, onMove, onPatch, onAskDelete, onCancelDelete, onDelete }) {
  // A photo stays put until ✥ Adjust is pressed — so scrolling the page on a
  // phone can't nudge it by accident — and a move or zoom is only kept when
  // Save is pressed. A video keeps the arrows below.
  const video = isVideo(s.image_url)
  const [draft, setDraft] = useState(null)
  const editing = draft !== null
  const [dx, dy, dz] = parseFocus(editing ? draft : s.focus)
  const changed = editing && draft !== formatFocus(...parseFocus(s.focus))
  const tags = (
    <>
      {!s.active && <span className="hm-hidden mono">HIDDEN</span>}
      <span className="hm-pos mono">{s.device === 'all' || !s.device ? 'BOTH' : device === 'mobile' ? 'PHONE' : 'PC'}</span>
    </>
  )
  return (
    <div className={`hm-card ${s.active ? '' : 'off'}`}>
      {video ? (
        <div className={`hm-shot ${device}`}>
          <video src={s.image_url} muted loop autoPlay playsInline style={{ objectPosition: s.focus || 'center' }} />
          {tags}
        </div>
      ) : (
        <FocusDrag
          className={`hm-shot ${device} ${editing ? 'editing' : ''}`}
          src={imgUrl(s.image_url, { w: device === 'mobile' ? 360 : 640 })}
          value={editing ? draft : s.focus}
          zoom
          disabled={!editing || busy}
          liveHint="Let go · then Save"
          onChange={(focus) => setDraft(focus)}
        >
          {tags}
        </FocusDrag>
      )}

      {!video && (editing ? (
        <div className="hm-adjust mono">
          <label className="hm-zoom">
            <span aria-hidden="true">−</span>
            <input
              type="range"
              min="1"
              max={MAX_ZOOM}
              step="0.05"
              value={dz}
              aria-label="Zoom"
              onChange={(e) => setDraft(formatFocus(dx, dy, Number(e.target.value)))}
            />
            <span aria-hidden="true">+</span>
            <b>{Math.round(dz * 100)}%</b>
          </label>
          <div className="hm-adjust-row">
            <button type="button" className="hm-vis" onClick={() => setDraft(formatFocus(50, 50, 1))} disabled={busy}>Reset</button>
            <span className="hm-adjust-end">
              <button type="button" className="hm-vis" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
              <button
                type="button"
                className="hm-vis on hm-save"
                disabled={busy || !changed}
                onClick={() => { onPatch({ focus: draft }); setDraft(null) }}
              >
                Save
              </button>
            </span>
          </div>
        </div>
      ) : (
        <button type="button" className="hm-vis hm-adjust-btn mono" onClick={() => setDraft(formatFocus(...parseFocus(s.focus)))} disabled={busy}>
          ✥ Adjust · move & zoom
        </button>
      ))}

      <input
        className="hm-name mono"
        defaultValue={s.label}
        aria-label="Your name for this photo"
        title="Your own name for this photo — not shown on the site"
        onBlur={(e) => {
          const v = e.target.value.trim().toUpperCase()
          if (v && v !== s.label) onPatch({ label: v })
        }}
      />

      {video && <FocusPicker value={s.focus} disabled={busy} onChange={(focus) => onPatch({ focus })} />}

      <div className="hm-card-row mono">
        <select value={s.device || 'all'} disabled={busy} onChange={(e) => onPatch({ device: e.target.value })} aria-label="Shows on">
          <option value="desktop">PC only</option>
          <option value="mobile">Phones only</option>
          <option value="all">Both</option>
        </select>
        <span className="hm-move">
          <button type="button" onClick={() => onMove(-1)} disabled={first || busy} aria-label="Earlier">←</button>
          <button type="button" onClick={() => onMove(1)} disabled={last || busy} aria-label="Later">→</button>
        </span>
      </div>

      <div className="hm-card-row mono">
        <button type="button" className={`hm-vis ${s.active ? 'on' : ''}`} onClick={() => onPatch({ active: !s.active })} disabled={busy}>
          {s.active ? 'Showing' : 'Hidden'}
        </button>
        {confirm ? (
          <span className="hm-confirm">
            <button type="button" className="hm-danger" onClick={onDelete}>Delete</button>
            <button type="button" className="hm-ghost" onClick={onCancelDelete}>No</button>
          </span>
        ) : (
          <button type="button" className="hm-x" onClick={onAskDelete} aria-label="Delete photo"><IconX width="13" height="13" /></button>
        )}
      </div>
    </div>
  )
}

// The top of the homepage on a phone and on a laptop, rotating like the site.
function Preview({ slides, button, countdown, onMoveCountdown, onSizeCountdown }) {
  const live = slides.filter((s) => s.active)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000)
    return () => clearInterval(id)
  }, [])
  const left = useCountdown(countdown.at || '')

  // A placed clock is kept inside its screen, as on the homepage.
  const previewRef = useRef(null)
  useLayoutEffect(() => {
    previewRef.current?.querySelectorAll('.hm-frame-placed .hm-frame-count').forEach((el) => keepInside(el, 6))
  })

  // Follows the pointer until it's let go.
  function follow(move) {
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  // Dragging the clock: its centre follows the pointer, in % of the screen.
  function drag(e, device) {
    if (!onMoveCountdown) return
    e.preventDefault()
    const box = e.currentTarget.closest('.hm-frame-screen').getBoundingClientRect()
    follow((ev) => onMoveCountdown(device, {
      x: ((ev.clientX - box.left) / box.width) * 100,
      y: ((ev.clientY - box.top) / box.height) * 100,
    }))
  }

  // The corner handle: pulling it out makes the clock bigger, in it smaller.
  function resize(e, device) {
    if (!onSizeCountdown) return
    e.preventDefault()
    e.stopPropagation()
    const clock = e.currentTarget.parentElement.getBoundingClientRect()
    const from = countdown.size?.[device] || 1
    const x0 = e.clientX
    const y0 = e.clientY
    follow((ev) => {
      // Mostly sideways; down counts too, as a corner pull does.
      const grow = Math.max(ev.clientX - x0, (ev.clientY - y0) * (clock.width / Math.max(clock.height, 1)))
      onSizeCountdown(device, from * (1 + grow / Math.max(clock.width, 1)))
    })
  }

  function frame(isPhone) {
    const list = slidesFor(live, isPhone)
    const cur = list.length ? list[tick % list.length] : null
    const device = isPhone ? 'phone' : 'pc'
    const at = countdown.pos?.[device]
    const scale = countdown.size?.[device] || 1
    const clock = left && (
      <span
        className="hm-frame-count hm-drag"
        style={{ ...(at ? { left: `${at.x}%`, top: `${at.y}%` } : {}), '--cd-scale': scale }}
        onPointerDown={(e) => drag(e, device)}
        title="Drag to place the countdown"
      >
        <small>{(countdown.label || 'NEXT DROP').toUpperCase()}</small>
        {left}
        {onSizeCountdown && <i className="hm-resize" onPointerDown={(e) => resize(e, device)} title="Drag to make it bigger or smaller" />}
      </span>
    )
    return (
      <div className={`hm-frame ${isPhone ? 'phone' : 'pc'}`}>
        <div className="hm-frame-screen">
          {cur && (isVideo(cur.image_url)
            ? <video key={cur.id} src={cur.image_url} muted loop autoPlay playsInline style={{ objectPosition: cur.focus || 'center' }} />
            : <img src={imgUrl(cur.image_url, { w: isPhone ? 360 : 720 })} alt="" style={focusStyle(cur.focus)} />)}
          <div className="hm-frame-shade" />
          {at && <div className="hm-frame-placed mono">{clock}</div>}
          <div className="hm-frame-center mono">
            {!at && clock}
            <span className="hm-frame-btn">{(button.label || 'SHOP NOW').toUpperCase()}</span>
          </div>
          {list.length > 1 && (
            <div className="hm-frame-dots">{list.map((s, i) => <i key={s.id} className={i === tick % list.length ? 'on' : ''} />)}</div>
          )}
        </div>
        <div className="hm-frame-name mono">{isPhone ? 'PHONE' : 'PC / LAPTOP'}</div>
      </div>
    )
  }

  return (
    <div className="hm-preview" ref={previewRef}>
      {frame(false)}
      {frame(true)}
    </div>
  )
}
