import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { imgUrl, uploadImage } from '../lib/images.js'
import { fetchFeatures, createFeature, updateFeature, deleteFeature, reorderFeatures } from '../lib/features.js'
import { fetchAllLooks, createLook, updateLook } from '../lib/lookbook.js'
import InfoTip from './InfoTip.jsx'
import FocusPicker from './FocusPicker.jsx'
import { IconX } from './Icons.jsx'

const MAX_PICS = 8
const dropKey = (s) => String(s || '').trim().toLowerCase()

// Admin → Homepage → Drop sections. Each section shows under the main hero:
// a wide photo with the drop's name, a line of text and SHOP NOW (→ that
// drop's products), then a row of picked photos — each one a look in the
// drop's lookbook, tagged with the products worn in it. Every change saves
// at once.
export default function FeatureManager({ drops = [], products = [] }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const [looks, setLooks] = useState([])

  async function loadLooks() {
    const { looks } = await fetchAllLooks()
    setLooks(looks)
  }

  async function load() {
    const { features, error } = await fetchFeatures({ all: true })
    if (error) setError("Couldn't load drop sections. Has the home_features migration run in Supabase?")
    setList(features)
    setLoading(false)
  }

  useEffect(() => { load(); loadLooks() }, [])

  async function add(kind = 'drop') {
    setBusy(true)
    setError('')
    const drop = drops[0] || 'NEW DROP'
    const row = kind === 'editorial'
      ? { kind, drop_name: '', title: 'A heading for the story', blurb: '', sort_order: list.length }
      : { drop_name: drop, title: drop, sort_order: list.length }
    const { error } = await createFeature(row)
    if (error) setError("Couldn't add a section — try again.")
    await load()
    setBusy(false)
  }

  async function patch(f, fields) {
    setList((prev) => prev.map((x) => (x.id === f.id ? { ...x, ...fields } : x)))
    const { error } = await updateFeature(f.id, fields)
    if (error) {
      setError("Couldn't save that change — try again.")
      load()
    }
  }

  async function upload(file) {
    return uploadImage(file, supabase, 'home')
  }

  async function withBusy(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.message || 'Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  async function move(i, dir) {
    const next = [...list]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    setList(next)
    await withBusy(async () => {
      await reorderFeatures(next)
      await load()
    })
  }

  async function remove(id) {
    await withBusy(async () => {
      await deleteFeature(id)
      setConfirmId(null)
      await load()
    })
  }

  return (
    <section className="hm-box wide">
      <div className="hm-box-head">
        <span className="hm-box-title mono">DROP SECTIONS & EDITORIAL BLOCKS · UNDER THE HERO</span>
        <InfoTip>
          <p>Everything under the main hero, top to bottom in this order. Two kinds, mixed however you like with ↑ ↓:</p>
          <p><b>Drop section</b> (+ Add drop section) — a drop’s banner and its best photos, below.</p>
          <p><b>Editorial block</b> (+ Add editorial block) — magazine style: one big photo beside a heading and two lines of text, with an optional link. Use it between drops to tell a story: the fabric, the shoot, the season.</p>
          <p>A drop section has:</p>
          <p><b>1.</b> A wide photo, 70% the height of the main hero, with the drop’s name and a short line of text at the bottom left, and a <b>SHOP NOW</b> button at the bottom right. SHOP NOW opens the shop with only that drop’s products.</p>
          <p><b>2.</b> A row of your best photos from the drop underneath (4 to a row on a PC, 2 on a phone). Each is a look in the drop’s lookbook; tapping one opens it with the products worn in it.</p>
          <p>A product belongs to a drop through the <b>Drop / collection</b> field in its product form. Hide a section to take it off the homepage without losing it.</p>
        </InfoTip>
      </div>

      {error && <div className="err-banner mono">{error}</div>}
      {!loading && list.length === 0 && <div className="empty mono">Nothing here yet — the homepage goes straight from the hero to the footer.</div>}

      <div className="fm-list">
        {list.map((f, i) => f.kind === 'editorial' ? (
          <EditorialCard
            key={f.id}
            f={f}
            index={i}
            count={list.length}
            drops={drops}
            busy={busy}
            confirm={confirmId === f.id}
            onPatch={(fields) => patch(f, fields)}
            onUpload={upload}
            withBusy={withBusy}
            onMove={(dir) => move(i, dir)}
            onAskDelete={() => setConfirmId(f.id)}
            onCancelDelete={() => setConfirmId(null)}
            onDelete={() => remove(f.id)}
          />
        ) : (
          <FeatureCard
            key={f.id}
            f={f}
            index={i}
            count={list.length}
            drops={drops}
            products={products}
            looks={looks}
            onLooksChanged={loadLooks}
            busy={busy}
            confirm={confirmId === f.id}
            onPatch={(fields) => patch(f, fields)}
            onUpload={upload}
            withBusy={withBusy}
            onMove={(dir) => move(i, dir)}
            onAskDelete={() => setConfirmId(f.id)}
            onCancelDelete={() => setConfirmId(null)}
            onDelete={() => remove(f.id)}
          />
        ))}
      </div>

      <div className="hm-actions">
        <button type="button" className="courier-btn mono" onClick={() => add('drop')} disabled={busy}>+ Add drop section</button>
        <button type="button" className="courier-btn ghost mono" onClick={() => add('editorial')} disabled={busy}>+ Add editorial block</button>
      </div>
    </section>
  )
}

function FeatureCard({ f, index, count, drops, products, looks, onLooksChanged, busy, confirm, onPatch, onUpload, withBusy, onMove, onAskDelete, onCancelDelete, onDelete }) {
  const pics = Array.isArray(f.pics) ? f.pics : []
  const dropProducts = useMemo(
    () => products.filter((p) => dropKey(p.drop_name) === dropKey(f.drop_name)),
    [products, f.drop_name]
  )
  const dropChoices = drops.some((d) => dropKey(d) === dropKey(f.drop_name)) ? drops : [f.drop_name, ...drops]
  const [title, setTitle] = useState(f.title || '')
  const [blurb, setBlurb] = useState(f.blurb || '')

  const setPics = (next) => onPatch({ pics: next })

  function pickPhoto(field) {
    return (e) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      withBusy(async () => {
        const url = await onUpload(file)
        await onPatch({ [field]: url })
      })
    }
  }

  // Every best photo is a look in the drop's lookbook: tapping it on the
  // homepage opens that look with the products worn in it.
  const dropLooks = useMemo(() => looks.filter((l) => dropKey(l.drop_name) === dropKey(f.drop_name)), [looks, f.drop_name])
  const lookById = useMemo(() => new Map(looks.map((l) => [String(l.id), l])), [looks])

  async function newLook(url) {
    const { look, error } = await createLook({ drop_name: f.drop_name, image_url: url, sort_order: dropLooks.length + 100 })
    if (error || !look) throw new Error("Couldn't add the photo to the lookbook — has the lookbook migration run?")
    return look
  }

  function addPics(e) {
    const files = [...(e.target.files || [])].slice(0, MAX_PICS - pics.length)
    e.target.value = ''
    if (!files.length) return
    withBusy(async () => {
      const added = []
      for (const file of files) {
        const url = await onUpload(file)
        const look = await newLook(url)
        added.push({ url, look_id: look.id })
      }
      await setPics([...pics, ...added])
      await onLooksChanged()
    })
  }

  // The drop's lookbook photos not shown here yet.
  function fillFromLooks() {
    const have = new Set(pics.map((p) => String(p.look_id)))
    const extra = dropLooks
      .filter((l) => l.active && !have.has(String(l.id)))
      .slice(0, MAX_PICS - pics.length)
      .map((l) => ({ url: l.image_url, look_id: l.id }))
    if (extra.length) setPics([...pics, ...extra])
  }

  // Tag or untag a product in a photo. A photo that isn't a look yet (added
  // before looks) becomes one first.
  function setTags(i, productIds) {
    withBusy(async () => {
      let pic = pics[i]
      if (!pic.look_id) {
        const look = await newLook(pic.url)
        pic = { url: pic.url, look_id: look.id }
        await setPics(pics.map((x, j) => (j === i ? pic : x)))
      }
      const { error } = await updateLook(pic.look_id, { product_ids: productIds.map(String) })
      if (error) throw new Error("Couldn't save the products in that photo — try again.")
      await onLooksChanged()
    })
  }

  function movePic(i, dir) {
    const next = [...pics]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    setPics(next)
  }

  return (
    <div className={`fm-card ${f.active ? '' : 'off'}`}>
      <div className="fm-card-head mono">
        <span className="hm-box-title">SECTION {index + 1}</span>
        <span className="hm-move">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0 || busy} aria-label="Move up">↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1 || busy} aria-label="Move down">↓</button>
        </span>
        <button type="button" className={`hm-vis ${f.active ? 'on' : ''}`} onClick={() => onPatch({ active: !f.active })} disabled={busy}>
          {f.active ? 'Showing' : 'Hidden'}
        </button>
        {confirm ? (
          <span className="hm-confirm">
            <button type="button" className="hm-danger" onClick={onDelete}>Delete section</button>
            <button type="button" className="hm-ghost" onClick={onCancelDelete}>No</button>
          </span>
        ) : (
          <button type="button" className="hm-x" onClick={onAskDelete} aria-label="Delete section"><IconX width="13" height="13" /></button>
        )}
      </div>

      <div className="fm-cols">
        {/* Banner photo(s) */}
        <div>
          <span className="hm-flabel mono">
            BANNER PHOTO · PC
            <InfoTip>The wide photo behind the drop’s name. About 2400 × 1350 px (16:9). Pick below which part stays in frame when the screen crops it.</InfoTip>
          </span>
          <label className={`fm-banner ${busy ? 'busy' : ''}`}>
            {f.image_url
              ? <img src={imgUrl(f.image_url, { w: 640 })} alt="" style={{ objectPosition: f.focus || 'center' }} />
              : <span className="mono">+ Upload banner photo</span>}
            <div className="fm-banner-text">
              <b>{f.title || f.drop_name}</b>
              <i>SHOP NOW</i>
            </div>
            <input type="file" accept="image/*" hidden disabled={busy} onChange={pickPhoto('image_url')} />
          </label>
          {f.image_url && <FocusPicker value={f.focus} disabled={busy} onChange={(focus) => onPatch({ focus })} />}

          <span className="hm-flabel mono" style={{ marginTop: 12 }}>
            BANNER PHOTO · PHONE (OPTIONAL)
            <InfoTip>A tall photo just for phones, about 1080 × 1500 px (it fills 70% of the phone’s height). Leave it empty and phones use the PC photo, cropped.</InfoTip>
          </span>
          <div className="fm-phone-row">
            <label className={`fm-phone ${busy ? 'busy' : ''}`}>
              {f.mobile_image_url
                ? <img src={imgUrl(f.mobile_image_url, { w: 240 })} alt="" />
                : <span className="mono">+ Upload</span>}
              <input type="file" accept="image/*" hidden disabled={busy} onChange={pickPhoto('mobile_image_url')} />
            </label>
            {f.mobile_image_url && (
              <button type="button" className="hm-ghost mono" onClick={() => onPatch({ mobile_image_url: null })} disabled={busy}>Remove</button>
            )}
          </div>
        </div>

        {/* Words and buttons */}
        <div>
          <label className="pf-field" style={{ marginTop: 0 }}>
            <span className="hm-flabel mono">
              DROP
              <InfoTip>Which drop this section is for. SHOP NOW opens the shop showing only products whose Drop / collection is this name. New drops appear here once a product carries them or they’re added under Side menu → Explore.</InfoTip>
            </span>
            <select value={f.drop_name} disabled={busy} onChange={(e) => {
              const drop = e.target.value
              const sameTitle = !f.title || f.title === f.drop_name
              if (sameTitle) setTitle(drop)
              onPatch(sameTitle ? { drop_name: drop, title: drop } : { drop_name: drop })
            }}>
              {dropChoices.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="pf-field">
            <span className="hm-flabel mono">
              NAME ON THE PHOTO
              <InfoTip>The big words at the bottom left of the banner, e.g. SUNDAY Fall 2026. Usually the drop’s name.</InfoTip>
            </span>
            <input value={title} maxLength={48} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== f.title && onPatch({ title: title.trim() })} placeholder={f.drop_name} />
          </label>
          <label className="pf-field">
            <span className="hm-flabel mono">
              TEXT UNDER THE NAME
              <InfoTip>One or two short sentences about the drop, under its name. Keep it under about 200 characters so it stays three lines or fewer.</InfoTip>
            </span>
            <textarea className="fm-text" value={blurb} maxLength={240} rows={3} onChange={(e) => setBlurb(e.target.value)} onBlur={() => blurb !== f.blurb && onPatch({ blurb: blurb.trim() })} placeholder="Overshirts, linen and tailored trousers for the cooler months." />
          </label>
          <label className="fm-check mono">
            <input type="checkbox" checked={!!f.show_lookbook} disabled={busy} onChange={(e) => onPatch({ show_lookbook: e.target.checked })} />
            Show A CLOSER LOOK button
            <InfoTip>A second button beside SHOP NOW that opens the drop’s lookbook (/lookbook/drop-name). Turn it on once you’ve added photos for this drop under Lookbook.</InfoTip>
          </label>
          <p className="hm-hint mono" style={{ marginTop: 10 }}>{dropProducts.length} product{dropProducts.length === 1 ? '' : 's'} in this drop.</p>
        </div>
      </div>

      {/* Best pics */}
      <span className="hm-flabel mono" style={{ marginTop: 14 }}>
        BEST PHOTOS UNDER THE BANNER · {pics.length}/{MAX_PICS}
        <InfoTip>
          <p>Your best photos from this drop, in a row under the banner: 4 to a row on a PC, 2 on a phone. Upload 4 (or 8) tall photos, about 1200 × 1600 px (3:4).</p>
          <p>Each photo is also a look in this drop’s <b>lookbook</b>. Under it, <b>+ Product in this photo</b> tags the pieces worn — shirt, trousers, bag, belt. On the site, tapping the photo opens the drop’s lookbook with this photo in the middle and those products underneath.</p>
          <p><b>Use lookbook photos</b> adds photos already in the drop’s lookbook. ✕ takes a photo off the homepage; it stays in the lookbook (delete it there under Lookbook).</p>
        </InfoTip>
      </span>
      <div className="fm-pics">
        {pics.map((p, i) => {
          const look = p.look_id ? lookById.get(String(p.look_id)) : null
          const tagged = (look?.product_ids || []).map(String)
          const byId = new Map(products.map((x) => [String(x.id), x]))
          const others = products.filter((x) => !tagged.includes(String(x.id)))
          const name = (x) => `${x.name}${x.variant ? ` · ${x.variant}` : ''}`
          return (
            <div className="fm-pic" key={`${p.url}-${i}`}>
              <div className="fm-pic-img"><img src={imgUrl(p.url, { w: 300 })} alt="" /></div>
              {tagged.length > 0 && (
                <ul className="fm-tags mono">
                  {tagged.map((id) => (
                    <li key={id}>
                      <span>{byId.get(id) ? name(byId.get(id)) : 'A removed product'}</span>
                      <button type="button" disabled={busy} aria-label="Untag" onClick={() => setTags(i, tagged.filter((t) => t !== id))}>×</button>
                    </li>
                  ))}
                </ul>
              )}
              <select className="mono" value="" disabled={busy} aria-label="Product in this photo" onChange={(e) => e.target.value && setTags(i, [...tagged, e.target.value])}>
                <option value="">+ Product in this photo</option>
                <optgroup label="This drop">
                  {others.filter((x) => dropKey(x.drop_name) === dropKey(f.drop_name)).map((x) => <option key={x.id} value={x.id}>{name(x)}</option>)}
                </optgroup>
                <optgroup label="Other products">
                  {others.filter((x) => dropKey(x.drop_name) !== dropKey(f.drop_name)).map((x) => <option key={x.id} value={x.id}>{name(x)}</option>)}
                </optgroup>
              </select>
              <div className="hm-card-row mono">
                <span className="hm-move">
                  <button type="button" onClick={() => movePic(i, -1)} disabled={i === 0 || busy} aria-label="Earlier">←</button>
                  <button type="button" onClick={() => movePic(i, 1)} disabled={i === pics.length - 1 || busy} aria-label="Later">→</button>
                </span>
                <button type="button" className="hm-x" onClick={() => setPics(pics.filter((_, j) => j !== i))} disabled={busy} aria-label="Remove photo"><IconX width="13" height="13" /></button>
              </div>
            </div>
          )
        })}
        {pics.length < MAX_PICS && (
          <label className={`fm-pic-add mono ${busy ? 'busy' : ''}`}>
            <span>{busy ? 'Working…' : '+ Add photos'}</span>
            <em>3:4, several at once</em>
            <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={addPics} />
          </label>
        )}
      </div>
      {pics.length < MAX_PICS && dropLooks.some((l) => l.active && !pics.some((p) => String(p.look_id) === String(l.id))) && (
        <div className="hm-actions">
          <button type="button" className="courier-btn ghost mono" onClick={fillFromLooks} disabled={busy}>Use lookbook photos</button>
        </div>
      )}
    </div>
  )
}

// Where an editorial block's link can go.
function editorialLinks(drops) {
  return [
    ['', 'No link'],
    ['/shop', 'Shop · everything'],
    ['/shop?filter=new_arrival', 'Shop · new arrivals'],
    ...drops.map((d) => [`/lookbook/${encodeURIComponent(d)}`, `Lookbook · ${d}`]),
    ...drops.map((d) => [`/shop?drop=${encodeURIComponent(d)}`, `Shop · ${d}`]),
    ['/about', 'About SUNDAY'],
  ]
}

// One editorial block: a big photo beside a heading, two lines of text and
// an optional link — magazine style, between the drop sections.
function EditorialCard({ f, index, count, drops, busy, confirm, onPatch, onUpload, withBusy, onMove, onAskDelete, onCancelDelete, onDelete }) {
  const [title, setTitle] = useState(f.title || '')
  const [blurb, setBlurb] = useState(f.blurb || '')
  const [label, setLabel] = useState(f.link_label || '')
  const choices = editorialLinks(drops)
  const known = choices.some(([v]) => v === (f.link || ''))

  function pickPhoto(field) {
    return (e) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      withBusy(async () => {
        const url = await onUpload(file)
        await onPatch({ [field]: url })
      })
    }
  }

  return (
    <div className={`fm-card ${f.active ? '' : 'off'}`}>
      <div className="fm-card-head mono">
        <span className="hm-box-title">SECTION {index + 1} · EDITORIAL</span>
        <span className="hm-move">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0 || busy} aria-label="Move up">↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === count - 1 || busy} aria-label="Move down">↓</button>
        </span>
        <button type="button" className={`hm-vis ${f.active ? 'on' : ''}`} onClick={() => onPatch({ active: !f.active })} disabled={busy}>
          {f.active ? 'Showing' : 'Hidden'}
        </button>
        {confirm ? (
          <span className="hm-confirm">
            <button type="button" className="hm-danger" onClick={onDelete}>Delete block</button>
            <button type="button" className="hm-ghost" onClick={onCancelDelete}>No</button>
          </span>
        ) : (
          <button type="button" className="hm-x" onClick={onAskDelete} aria-label="Delete block"><IconX width="13" height="13" /></button>
        )}
      </div>

      <div className="fm-cols">
        <div>
          <span className="hm-flabel mono">
            PHOTO
            <InfoTip>The big photo of the block, on the left on a computer and on top on a phone. A tall photo works best: about 1600 × 2000 px (4:5). Pick below which part stays in frame.</InfoTip>
          </span>
          <label className={`fm-banner fm-editorial ${busy ? 'busy' : ''}`}>
            {f.image_url
              ? <img src={imgUrl(f.image_url, { w: 480 })} alt="" style={{ objectPosition: f.focus || 'center' }} />
              : <span className="mono">+ Upload photo</span>}
            <input type="file" accept="image/*" hidden disabled={busy} onChange={pickPhoto('image_url')} />
          </label>
          {f.image_url && <FocusPicker value={f.focus} disabled={busy} onChange={(focus) => onPatch({ focus })} />}
        </div>

        <div>
          <label className="pf-field" style={{ marginTop: 0 }}>
            <span className="hm-flabel mono">
              HEADING
              <InfoTip>The big words beside the photo, e.g. “Linen, washed twice”. A few words read best.</InfoTip>
            </span>
            <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== f.title && onPatch({ title: title.trim() })} />
          </label>
          <label className="pf-field">
            <span className="hm-flabel mono">
              TWO LINES OF TEXT
              <InfoTip>One or two sentences under the heading — the story behind the pieces. About 160 characters at most.</InfoTip>
            </span>
            <textarea className="fm-text" rows={3} maxLength={180} value={blurb} onChange={(e) => setBlurb(e.target.value)} onBlur={() => blurb !== f.blurb && onPatch({ blurb: blurb.trim() })} placeholder="Cut from Japanese linen and washed twice, so it’s soft from the first wear." />
          </label>
          <label className="pf-field">
            <span className="hm-flabel mono">
              LINK (OPTIONAL)
              <InfoTip>Where the link under the text goes — a drop’s lookbook, its products, or the shop. No link shows the photo and words only.</InfoTip>
            </span>
            <select value={known ? (f.link || '') : 'custom'} disabled={busy} onChange={(e) => e.target.value !== 'custom' && onPatch({ link: e.target.value || null })}>
              {choices.map(([v, l]) => <option key={v || 'none'} value={v}>{l}</option>)}
              <option value="custom">Another page or link…</option>
            </select>
          </label>
          {!known && (
            <label className="pf-field">
              <span className="hm-flabel mono">ADDRESS</span>
              <input defaultValue={f.link || ''} placeholder="/product/… or https://…" onBlur={(e) => onPatch({ link: e.target.value.trim() || null })} />
            </label>
          )}
          {f.link && (
            <label className="pf-field">
              <span className="hm-flabel mono">LINK WORDS</span>
              <input value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== (f.link_label || '') && onPatch({ link_label: label.trim() || null })} placeholder="Discover" />
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
