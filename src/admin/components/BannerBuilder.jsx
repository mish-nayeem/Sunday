import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { imgUrl, uploadImage } from '../lib/images.js'
import { listSales } from '../lib/sales.js'
import { fetchCoupons, describeCoupon } from '../lib/coupons.js'
import { toLocalInput, fromLocalInput } from '../lib/schedule.js'
import { dropKey } from '../lib/lookbook.js'
import useDraft from '../lib/useDraft.js'
import DraftNote from './DraftNote.jsx'
import AdminBox from './AdminBox.jsx'
import InfoTip from './InfoTip.jsx'
import {
  FONTS, PLACES, HEIGHTS, WIDTHS, newBanner, fetchCustomBanners, saveCustomBanners, isLive, linkOf,
} from '../lib/customBanners.js'
import { CustomBanner } from '@/components/home/CustomBanner.jsx'
import './banner-builder.css'

// Website → Banners → Your banners: design a sale or coupon banner here —
// words, colours, font, size, a countdown, a code to copy — or upload one
// made in Canva; choose the pages it shows on and where a click takes the
// shopper (the products on the sale, or products picked by hand). Nothing
// changes on the site until Save.
export default function BannerBuilder({ products = [] }) {
  const [list, setList] = useState(null)
  const [saved, setSaved] = useState('')
  const [openId, setOpenId] = useState(null)
  const [sales, setSales] = useState([])
  const [coupons, setCoupons] = useState([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState('')
  const [note, setNote] = useState('')
  const [view, setView] = useState('pc')
  const [q, setQ] = useState('')

  useEffect(() => {
    fetchCustomBanners().then(({ banners, error }) => {
      setList(banners)
      setSaved(JSON.stringify(banners))
      setOpenId(banners[0]?.id || null)
      if (error) setNote("Couldn't load the banners. Check the connection and reload.")
    })
    listSales().then((r) => setSales(r.sales || [])).catch(() => {})
    fetchCoupons().then((r) => setCoupons(r.coupons || [])).catch(() => {})
  }, [])

  const kept = useDraft('custom-banners', list, setList, { enabled: Boolean(list) })

  const drops = useMemo(() => {
    const m = new Map()
    for (const p of products) if (p.drop_name) m.set(dropKey(p.drop_name), p.drop_name.trim())
    return [...m.values()].sort()
  }, [products])

  if (!list) return <div className="empty mono">Loading…</div>

  const dirty = JSON.stringify(list) !== saved
  const b = list.find((x) => x.id === openId) || null
  const set = (patch) => { setList((prev) => prev.map((x) => (x.id === openId ? { ...x, ...patch } : x))); setNote('') }
  const move = (i, d) => setList((prev) => {
    const next = [...prev]
    const j = i + d
    if (j < 0 || j >= next.length) return prev
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  function add() {
    const nb = newBanner()
    setList((prev) => [nb, ...prev])
    setOpenId(nb.id)
  }
  function duplicate(x) {
    const nb = { ...x, id: `b${Date.now().toString(36)}`, name: `${x.name} (copy)` }
    setList((prev) => [nb, ...prev])
    setOpenId(nb.id)
  }
  function remove(x) {
    if (!window.confirm(`Delete "${x.name}"? It comes off the site when you Save.`)) return
    setList((prev) => prev.filter((y) => y.id !== x.id))
    if (openId === x.id) setOpenId(null)
  }

  async function upload(field, file) {
    if (!file) return
    setUploading(field)
    setNote('')
    try {
      const url = await uploadImage(file, supabase, 'banners')
      set({ [field]: url })
    } catch (e) {
      setNote(`Couldn't upload: ${e.message}`)
    } finally {
      setUploading('')
    }
  }

  async function save() {
    setBusy(true)
    const clean = list.map((x) => ({ ...x, code: String(x.code || '').trim().toUpperCase(), name: x.name.trim() || 'Banner' }))
    const { error } = await saveCustomBanners(clean)
    setBusy(false)
    if (error) return setNote("Couldn't save — check the connection and try again.")
    setList(clean)
    setSaved(JSON.stringify(clean))
    kept.saved(clean)
    setNote('Saved — live on the website now.')
  }

  const status = (x) => {
    if (!x.on) return 'Off'
    if (x.starts_at && new Date(x.starts_at) > new Date()) return 'Starts later'
    if (x.ends_at && new Date(x.ends_at) <= new Date()) return 'Ended'
    return 'Live'
  }
  const needle = q.trim().toLowerCase()
  const pickable = products.filter((p) => !needle || `${p.name} ${p.variant || ''} ${p.sku || ''}`.toLowerCase().includes(needle))
  const toggleProduct = (id) => set({
    product_ids: (b.product_ids || []).includes(String(id)) ? b.product_ids.filter((x) => x !== String(id)) : [...(b.product_ids || []), String(id)],
  })
  const knownCode = b && b.code && coupons.some((c) => c.code === String(b.code).trim().toUpperCase() && c.active)

  return (
    <div className="bb">
      <DraftNote draft={kept} />

      <AdminBox
        wide
        title="YOUR BANNERS"
        tip={
          <>
            <p>Banners you design yourself, for a sale, a coupon or anything else. They show on the pages you tick, in this order (↑ ↓), between their start and end times.</p>
            <p>Write one here — words, colours, font, size — or make it in Canva and upload the picture. Add a countdown, a coupon code customers can copy, and where a click takes them: the products on a sale, or products you pick.</p>
            <p>Nothing changes on the site until you press <b>Save</b>.</p>
          </>
        }
      >
        <div className="bb-list">
          {list.map((x, i) => (
            <div key={x.id} className={`bb-row ${openId === x.id ? 'on' : ''} ${isLive(x) ? '' : 'off'}`}>
              <button type="button" className="bb-row-main" onClick={() => setOpenId(x.id)}>
                <span className="bb-row-name">{x.name}</span>
                <span className={`bb-row-status mono ${status(x) === 'Live' ? 'live' : ''}`}>{status(x)}</span>
                <span className="bb-row-where mono">{(x.places || []).map((p) => PLACES.find((y) => y.key === p)?.label.split(' · ')[0] + (p === 'home-end' ? ' (bottom)' : '')).join(', ') || 'Nowhere yet'}</span>
              </button>
              <span className="bb-row-tools">
                <button type="button" className={`ab-switch mono ${x.on ? 'on' : ''}`} onClick={() => setList((prev) => prev.map((y) => (y.id === x.id ? { ...y, on: !y.on } : y)))}>{x.on ? 'On' : 'Off'}</button>
                <button type="button" className="ab-tool" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Earlier">↑</button>
                <button type="button" className="ab-tool" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Later">↓</button>
                <button type="button" className="ab-tool" onClick={() => duplicate(x)} title="Duplicate">⧉</button>
                <button type="button" className="ab-tool danger" onClick={() => remove(x)} aria-label={`Delete ${x.name}`}>✕</button>
              </span>
            </div>
          ))}
          {list.length === 0 && <div className="ab-empty mono">No banners yet — + New banner to make the first.</div>}
        </div>
        <div className="ab-row" style={{ marginTop: 12 }}>
          <button type="button" className="ab-btn" onClick={add}>+ New banner</button>
          <button type="button" className="ab-btn bb-save" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
          {note && <span className="ab-note mono">{note}</span>}
        </div>
      </AdminBox>

      {b && (
        <>
          <AdminBox wide title="PREVIEW" side={
            <span className="chips mono">
              {[['pc', 'PC'], ['phone', 'Phone']].map(([k, l]) => <button key={k} type="button" className={`chip ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{l}</button>)}
            </span>
          }>
            <div className={`bb-preview ${view}`}>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                <div className={view === 'pc' ? (WIDTHS.find((w) => w.key === b.width) || WIDTHS[0]).cls : ''}>
                  <CustomBanner b={b} preview />
                </div>
              </div>
            </div>
            <p className="bb-hint mono">A click goes to: {linkOf(b) || 'nowhere'}{!isLive(b) ? ' · not showing right now (' + status(b).toLowerCase() + ')' : ''}</p>
          </AdminBox>

          <div className="bb-grid">
            <AdminBox title="BANNER">
              <label className="bb-field"><span className="ab-label">NAME (ONLY YOU SEE IT)</span>
                <input className="ab-input" value={b.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
              </label>
              <span className="ab-label">MADE HOW</span>
              <div className="chips mono">
                <button type="button" className={`chip ${b.mode === 'design' ? 'on' : ''}`} onClick={() => set({ mode: 'design' })}>Write it here</button>
                <button type="button" className={`chip ${b.mode === 'image' ? 'on' : ''}`} onClick={() => set({ mode: 'image' })}>Upload a picture (Canva…)</button>
              </div>

              {b.mode === 'design' ? (
                <>
                  <label className="bb-field"><span className="ab-label">SMALL LINE ON TOP</span>
                    <input className="ab-input" value={b.eyebrow} maxLength={40} onChange={(e) => set({ eyebrow: e.target.value })} placeholder="LIMITED TIME" />
                  </label>
                  <label className="bb-field"><span className="ab-label">HEADLINE</span>
                    <input className="ab-input" value={b.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} placeholder="EID SALE · 20% OFF" />
                  </label>
                  <label className="bb-field"><span className="ab-label">TEXT</span>
                    <textarea className="ab-input" rows={2} value={b.text} maxLength={200} onChange={(e) => set({ text: e.target.value })} placeholder="On every shirt, this week only." />
                  </label>
                  <label className="bb-field"><span className="ab-label">BUTTON <InfoTip>Shows only when a click goes somewhere (CLICK GOES TO).</InfoTip></span>
                    <input className="ab-input" value={b.button} maxLength={30} onChange={(e) => set({ button: e.target.value })} placeholder="Shop the sale" />
                  </label>
                </>
              ) : (
                <>
                  <p className="bb-help">
                    Make it in Canva and download it as PNG or JPG. Good sizes: <b>1920 × 600</b> for a full-width banner on a computer,
                    <b> 1080 × 1080</b> (or 1080 × 1350) for phones. The picture keeps its own shape.
                  </p>
                  <div className="bb-uploads">
                    {[['image', 'PICTURE (COMPUTER)'], ['imagePhone', 'PICTURE FOR PHONES (OPTIONAL)']].map(([field, label]) => (
                      <div key={field} className="bb-upload">
                        <span className="ab-label">{label}</span>
                        {b[field] ? <img src={imgUrl(b[field], { w: 400 })} alt="" /> : <div className="bb-upload-empty mono">No picture</div>}
                        <span className="ab-row">
                          <label className="ab-btn bb-file">
                            {uploading === field ? 'Uploading…' : b[field] ? 'Change' : 'Upload'}
                            <input type="file" accept="image/*" hidden disabled={Boolean(uploading)} onChange={(e) => { upload(field, e.target.files?.[0]); e.target.value = '' }} />
                          </label>
                          {b[field] && <button type="button" className="ab-tool danger" onClick={() => set({ [field]: '' })}>Remove</button>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <label className="bb-field"><span className="ab-label">WHAT IT SAYS (FOR SCREEN READERS AND GOOGLE)</span>
                    <input className="ab-input" value={b.alt} maxLength={120} onChange={(e) => set({ alt: e.target.value })} placeholder="Eid sale, 20% off every shirt" />
                  </label>
                </>
              )}
            </AdminBox>

            {b.mode === 'design' && (
              <AdminBox title="LOOK">
                <div className="bb-colours">
                  {[['bg', 'BACKGROUND'], ['bg2', 'SECOND COLOUR (FADE)'], ['color', 'TEXT'], ['accent', 'ACCENT (TOP LINE, BUTTON, CODE)']].map(([k, label]) => (
                    <label key={k} className="bb-colour">
                      <span className="ab-label">{label}</span>
                      <span className="bb-colour-row">
                        <input type="color" value={b[k] || '#ffffff'} onChange={(e) => set({ [k]: e.target.value })} />
                        <input className="ab-input mono" value={b[k] || ''} maxLength={7} onChange={(e) => set({ [k]: e.target.value })} placeholder={k === 'bg2' ? 'none' : '#000000'} />
                        {k === 'bg2' && b.bg2 && <button type="button" className="ab-tool" onClick={() => set({ bg2: '' })}>None</button>}
                      </span>
                    </label>
                  ))}
                </div>
                <label className="bb-field"><span className="ab-label">HEADLINE FONT</span>
                  <select className="ab-input" value={b.font} onChange={(e) => set({ font: e.target.value })}>
                    {FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </label>
                <label className="bb-field"><span className="ab-label">TEXT FONT</span>
                  <select className="ab-input" value={b.textFont} onChange={(e) => set({ textFont: e.target.value })}>
                    {FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </label>
                <label className="bb-field"><span className="ab-label">HEADLINE SIZE · {b.titleSize}px</span>
                  <input type="range" min="16" max="96" step="1" value={b.titleSize} onChange={(e) => set({ titleSize: Number(e.target.value) })} />
                </label>
                <span className="ab-label">LINE UP</span>
                <div className="chips mono">
                  {[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']].map(([k, l]) => <button key={k} type="button" className={`chip ${b.align === k ? 'on' : ''}`} onClick={() => set({ align: k })}>{l}</button>)}
                </div>
                <span className="ab-label">HEIGHT</span>
                <div className="chips mono">
                  {HEIGHTS.map((h) => <button key={h.key} type="button" className={`chip ${b.height === h.key ? 'on' : ''}`} onClick={() => set({ height: h.key })}>{h.label}</button>)}
                </div>
                <label className="bb-field"><span className="ab-label">ROUNDED CORNERS · {b.radius}px</span>
                  <input type="range" min="0" max="40" step="1" value={b.radius} onChange={(e) => set({ radius: Number(e.target.value) })} />
                </label>
              </AdminBox>
            )}

            <AdminBox title="WHERE & HOW BIG">
              <span className="ab-label">SHOWS ON</span>
              <div className="bb-checks">
                {PLACES.map((p) => (
                  <label key={p.key} className="bb-check">
                    <input type="checkbox" checked={(b.places || []).includes(p.key)} onChange={(e) => set({ places: e.target.checked ? [...(b.places || []), p.key] : b.places.filter((x) => x !== p.key) })} />
                    {p.label}
                  </label>
                ))}
              </div>
              <span className="ab-label">WIDTH ON A COMPUTER <InfoTip>Half and third put banners side by side, in the order of the list. Phones always show one under the other, full width.</InfoTip></span>
              <div className="chips mono">
                {WIDTHS.map((w) => <button key={w.key} type="button" className={`chip ${b.width === w.key ? 'on' : ''}`} onClick={() => set({ width: w.key })}>{w.label}</button>)}
              </div>
              {b.mode === 'image' && <p className="bb-help">A picture's height follows its own shape — make it taller or shorter in Canva.</p>}
            </AdminBox>

            <AdminBox title="WHEN & TIMER">
              <label className="bb-field"><span className="ab-label">STARTS (EMPTY = NOW)</span>
                <input className="ab-input" type="datetime-local" value={toLocalInput(b.starts_at)} onChange={(e) => set({ starts_at: fromLocalInput(e.target.value) || '' })} />
              </label>
              <label className="bb-field"><span className="ab-label">ENDS (EMPTY = UNTIL YOU TURN IT OFF)</span>
                <input className="ab-input" type="datetime-local" value={toLocalInput(b.ends_at)} onChange={(e) => set({ ends_at: fromLocalInput(e.target.value) || '' })} />
              </label>
              <label className="bb-check">
                <input type="checkbox" checked={Boolean(b.timer)} onChange={(e) => set({ timer: e.target.checked })} />
                Show a countdown
              </label>
              {b.timer && (
                <>
                  <label className="bb-field"><span className="ab-label">WORDS BEFORE IT</span>
                    <input className="ab-input" value={b.timerLabel} maxLength={30} onChange={(e) => set({ timerLabel: e.target.value })} placeholder="Ends in" />
                  </label>
                  <label className="bb-field"><span className="ab-label">COUNTS DOWN TO (EMPTY = THE END TIME)</span>
                    <input className="ab-input" type="datetime-local" value={toLocalInput(b.timerTo)} onChange={(e) => set({ timerTo: fromLocalInput(e.target.value) || '' })} />
                  </label>
                  {!b.timerTo && !b.ends_at && <div className="ab-warn mono">Set an end time (or a time to count down to) — there's nothing to count down to yet.</div>}
                </>
              )}
            </AdminBox>

            <AdminBox title="COUPON CODE" tip="A code customers can copy from the banner with one tap and paste at checkout. Make the code itself in Marketing → Coupons first, or checkout won't take it.">
              {coupons.length > 0 && (
                <select className="ab-input" value="" onChange={(e) => { const c = coupons.find((x) => x.code === e.target.value); if (c) set({ code: c.code }) }}>
                  <option value="">Pick from your coupons…</option>
                  {coupons.map((c) => <option key={c.code} value={c.code}>{c.code} — {describeCoupon(c)}{c.active ? '' : ' (off)'}</option>)}
                </select>
              )}
              <input className="ab-input mono" value={b.code} maxLength={24} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="CODE, e.g. EID10 — empty for none" style={{ marginTop: 8 }} />
              {b.code && !knownCode && <div className="ab-warn mono">No active coupon “{String(b.code).toUpperCase()}” in Marketing → Coupons — checkout won't accept it.</div>}
            </AdminBox>

            <AdminBox title="CLICK GOES TO" wide tip="Where the shopper lands after tapping the banner. The products on a sale, or products you pick, open as their own list in the shop with the banner's headline on top.">
              <div className="chips mono">
                {[['none', 'Nowhere'], ['sale', 'Products on a sale'], ['products', 'Products I pick'], ['drop', 'A collection'], ['all', 'All products'], ['url', 'Another page / link']].map(([k, l]) => (
                  <button key={k} type="button" className={`chip ${b.link === k ? 'on' : ''}`} onClick={() => set({ link: k })}>{l}</button>
                ))}
              </div>
              {b.link === 'sale' && (
                <select className="ab-input" value={b.sale_id} onChange={(e) => set({ sale_id: e.target.value })} style={{ marginTop: 10 }}>
                  <option value="">Pick a sale…</option>
                  {sales.map((s) => <option key={s.id} value={s.id}>{s.name || 'Sale'} · {s.percent}% off · {s.drop_name ? s.drop_name : s.product_ids?.length ? `${s.product_ids.length} products` : 'everything'}{s.active ? '' : ' (off)'}</option>)}
                </select>
              )}
              {b.link === 'drop' && (
                <select className="ab-input" value={b.drop} onChange={(e) => set({ drop: e.target.value })} style={{ marginTop: 10 }}>
                  <option value="">Pick a collection…</option>
                  {drops.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              {b.link === 'url' && (
                <input className="ab-input" value={b.url} onChange={(e) => set({ url: e.target.value })} placeholder="/shop?category=… or https://…" style={{ marginTop: 10 }} />
              )}
              {b.link === 'products' && (
                <div className="bb-products">
                  <div className="ab-row">
                    <input className="ab-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" />
                    <span className="mono dim">{(b.product_ids || []).length} picked</span>
                    {(b.product_ids || []).length > 0 && <button type="button" className="ab-tool" onClick={() => set({ product_ids: [] })}>Clear</button>}
                  </div>
                  <div className="bb-product-grid">
                    {pickable.map((p) => {
                      const on = (b.product_ids || []).includes(String(p.id))
                      return (
                        <button key={p.id} type="button" className={`bb-product ${on ? 'on' : ''}`} onClick={() => toggleProduct(p.id)}>
                          <span className="bb-product-img">{p.images?.[0] && <img src={imgUrl(p.images[0], { w: 160 })} alt="" />}</span>
                          <span className="bb-product-name">{p.name}{p.variant ? ` · ${p.variant}` : ''}</span>
                          {on && <span className="bb-product-tick">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </AdminBox>
          </div>

          <div className="ab-row bb-bottom">
            <button type="button" className="ab-btn bb-save" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save banners' : 'Saved'}</button>
            {note && <span className="ab-note mono">{note}</span>}
          </div>
        </>
      )}
    </div>
  )
}
