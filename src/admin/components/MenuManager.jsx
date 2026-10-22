import { useEffect, useMemo, useState } from 'react'
import {
  fetchAllNavCategories,
  createNavCategory,
  updateNavCategory,
  deleteNavCategory,
  reorderNavCategories,
  ensureShopCategory,
} from '../lib/navCategories.js'
import { linkChoices, rowLink, dropOf, lookbookLink, categoryOptions, categoryKey, DEFAULT_SHOP } from '@/lib/menus'
import { IconX } from './Icons.jsx'
import AdminBox from './AdminBox.jsx'
import InfoTip from './InfoTip.jsx'
import './category-manager.css'

// "Goes to → New category…" in the SHOP tab: makes a product category.
const NEW_CATEGORY = '__new_category'

const TABS = {
  shop: {
    title: 'SHOP TAB',
    intro: 'The SHOP tab of the side menu (☰ at the top left of the site): links to all products, new arrivals, categories — whatever you put here, in this order. Under them the site adds SHOP BY COLLECTION by itself: hovering it lists your drops (the EXPLORE rows), each opening that drop’s products.',
    empty: `Nothing here yet, so the site shows the default list: ${DEFAULT_SHOP.map((d) => d.label).join(', ')}.`,
  },
  drops: {
    title: 'EXPLORE TAB',
    intro: 'The EXPLORE tab of the side menu: your drops’ lookbooks. Each row opens that drop’s lookbook, where tapping a photo shows the products worn in it to shop one by one. A drop you create in Products → Collections appears here by itself. The same drops are listed under SHOP → Shop by collection for drop-wise shopping.',
    empty: 'Nothing here yet, so the site lists every drop a product carries, A to Z.',
  },
}

// Admin → Side menu. One box per tab of the ☰ menu: add a row (its words
// and where it goes), rename it, point it elsewhere, reorder, hide, delete.
export default function MenuManager({ menu, drops = [], products = [] }) {
  const config = TABS[menu]
  const [rows, setRows] = useState([])
  // Categories made here or in the product form are choices too.
  const choices = useMemo(
    () => linkChoices(drops, menu === 'shop' ? categoryOptions(rows, products.map((p) => p.category)) : []),
    [drops, rows, products, menu]
  )
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const [draft, setDraft] = useState({ label: '', link: menu === 'drops' && drops[0] ? lookbookLink(drops[0]) : '/shop' })

  async function load() {
    const { categories, error } = await fetchAllNavCategories(menu)
    if (error) setError(`Couldn't load the ${config.title} — has the side-menu migration run in Supabase? (${error.message})`)
    setRows(categories)
    setLoading(false)
  }

  useEffect(() => { load() }, [menu])

  async function run(fn) {
    setBusy(true)
    setError('')
    const { error } = (await fn()) || {}
    if (error) setError("Couldn't save that — try again.")
    await load()
    setBusy(false)
  }

  // The words a link suggests, so picking "Drop · EID 26" fills in EID 26.
  const suggest = (link) => {
    const hit = choices.find(([v]) => v === link)
    return hit ? hit[1].replace(/^Drop · /, '').replace(/ \(all\)$/, '') : ''
  }

  const makingCategory = draft.link === NEW_CATEGORY

  function add(e) {
    e.preventDefault()
    const label = (draft.label.trim() || suggest(draft.link)).toUpperCase()
    // A new category: its own shop page (/shop?type=key), and it shows in the
    // product form's Category list for products to be filed under.
    if (makingCategory) {
      const key = categoryKey(label)
      if (key) run(() => ensureShopCategory(key, label))
      setDraft({ ...draft, label: '' })
      return
    }
    const link = draft.link.trim()
    if (!label || !link) return
    run(() => createNavCategory({ label, link, sortOrder: rows.length, menu }))
    setDraft({ ...draft, label: '' })
  }

  function move(i, dir) {
    const next = [...rows]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    setRows(next)
    run(() => reorderNavCategories(next))
  }

  // The drops products carry that the EXPLORE tab doesn't list yet.
  const missingDrops = useMemo(() => {
    if (menu !== 'drops') return []
    const listed = new Set(rows.map((r) => dropOf(rowLink(r)).toLowerCase()))
    return drops.filter((d) => !listed.has(d.toLowerCase()))
  }, [menu, rows, drops])

  const counts = useMemo(() => {
    const map = {}
    for (const p of products) if (p.drop_name) map[p.drop_name] = (map[p.drop_name] || 0) + 1
    return map
  }, [products])

  const visible = rows.filter((r) => r.active)
  const linkSelect = (value, onChange, label, allowNew = false) => {
    const known = value === NEW_CATEGORY || choices.some(([v]) => v === value)
    return (
      <select className="ab-input mono" value={known ? value : 'custom'} aria-label={label} disabled={busy}
        onChange={(e) => onChange(e.target.value === 'custom' ? (known ? '' : value) : e.target.value)}>
        {allowNew && <option value={NEW_CATEGORY}>+ New category…</option>}
        {choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        <option value="custom">Another link…</option>
      </select>
    )
  }

  return (
    <AdminBox
      title={config.title}
      side={loading ? '' : `${visible.length} showing${rows.length > visible.length ? ` · ${rows.length - visible.length} hidden` : ''}`}
      tip={
        <>
          <p>{config.intro}</p>
          <p><b>To add:</b> pick where it goes under <b>Goes to</b>, type the words to show (or leave them empty to use the suggested name), then + Add.</p>
          {menu === 'shop' && <p><b>New category:</b> Goes to → + New category…, type its name (e.g. TRACKSUITS), + Add. It gets its own shop page and appears in the product form’s Category list; a category made with + New category in the product form shows up here the same way.</p>}
          <p><b>To change:</b> edit the words in a row (saved when you click away) or pick a new Goes to. ↑ ↓ change the order, Showing/Hidden takes a row off the menu without deleting it, ✕ deletes it.</p>
          <p>Another link… takes a page on the site starting with / (e.g. /product/…) or a full https:// link.</p>
        </>
      }
    >
      {/* What a shopper sees in the ☰ menu. */}
      <div className="mm-preview">
        <div className="mm-preview-tabs mono">
          <span className={menu === 'shop' ? 'on' : ''}>SHOP</span>
          <span className={menu === 'drops' ? 'on' : ''}>EXPLORE</span>
        </div>
        <div className={`mm-preview-list mono ${menu === 'drops' ? 'right' : ''}`}>
          {visible.length ? visible.map((r) => <span key={r.id}>{r.label}</span>) : <em>{config.empty}</em>}
        </div>
      </div>

      {error && <div className="err-banner mono">{error}</div>}

      <form className="mm-add" onSubmit={add}>
        <label className="mm-field">
          <span className="ab-label">GOES TO</span>
          {linkSelect(draft.link, (link) => setDraft({ ...draft, link }), 'Goes to', menu === 'shop')}
        </label>
        {!makingCategory && !choices.some(([v]) => v === draft.link) && (
          <label className="mm-field">
            <span className="ab-label">LINK</span>
            <input className="ab-input mono" value={draft.link} placeholder="/shop?drop=… or https://…" onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
          </label>
        )}
        <label className="mm-field">
          <span className="ab-label">{makingCategory ? 'NEW CATEGORY NAME' : 'WORDS ON THE MENU'}</span>
          <input className="ab-input mono" value={draft.label} maxLength={40} placeholder={makingCategory ? 'e.g. TRACKSUITS' : suggest(draft.link).toUpperCase() || 'e.g. NEW ARRIVALS'} onChange={(e) => setDraft({ ...draft, label: e.target.value.toUpperCase() })} disabled={busy} />
        </label>
        <button className="ab-btn mono" disabled={busy || !draft.link.trim() || (makingCategory && !categoryKey(draft.label))}>{busy ? 'Working…' : '+ Add'}</button>
      </form>

      {missingDrops.length > 0 && (
        <div className="cm-suggest mono">
          <span className="ab-label">
            DROPS NOT IN EXPLORE YET
            <InfoTip>Drops your products carry that this tab doesn’t list. One tap adds it, linked to that drop’s lookbook.</InfoTip>
          </span>
          <div className="cm-chips">
            {missingDrops.map((d) => (
              <button key={d} type="button" disabled={busy} onClick={() => run(() => createNavCategory({ label: d.toUpperCase(), link: lookbookLink(d), sortOrder: rows.length, menu }))}>
                + {d} <b>{counts[d] || 0}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="ab-empty mono">Loading…</div>}
      {!loading && rows.length === 0 && <div className="ab-empty mono">{config.empty}</div>}

      <div className="cm-list">
        {rows.map((r, i) => {
          const link = rowLink(r)
          return (
            <div className={`mm-row ${r.active ? '' : 'off'}`} key={r.id}>
              <span className="cm-pos mono">{i + 1}</span>
              <input className="cm-name mono" defaultValue={r.label} aria-label="Words on the menu"
                onBlur={(e) => {
                  const v = e.target.value.trim().toUpperCase()
                  if (v && v !== r.label) run(() => updateNavCategory(r.id, { label: v }))
                }} />
              <span className="mm-link">
                {linkSelect(link, (next) => next && next !== link && run(() => updateNavCategory(r.id, { link: next })), 'Goes to')}
                {!choices.some(([v]) => v === link) && (
                  <input className="ab-input mono" defaultValue={link} aria-label="Link"
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== link) run(() => updateNavCategory(r.id, { link: v })) }} />
                )}
              </span>
              <span className="cm-tools">
                <button type="button" className="ab-tool" onClick={() => move(i, -1)} disabled={i === 0 || busy} aria-label="Up">↑</button>
                <button type="button" className="ab-tool" onClick={() => move(i, 1)} disabled={i === rows.length - 1 || busy} aria-label="Down">↓</button>
                <button type="button" className={`ab-switch mono ${r.active ? 'on' : ''}`} onClick={() => run(() => updateNavCategory(r.id, { active: !r.active }))} disabled={busy}>
                  {r.active ? 'Showing' : 'Hidden'}
                </button>
                {confirmId === r.id ? (
                  <span className="ab-confirm mono">
                    <button type="button" className="ab-yes" onClick={() => { setConfirmId(null); run(() => deleteNavCategory(r.id)) }}>Delete</button>
                    <button type="button" className="ab-no" onClick={() => setConfirmId(null)}>No</button>
                  </span>
                ) : (
                  <button type="button" className="ab-tool danger" onClick={() => setConfirmId(r.id)} aria-label="Delete">
                    <IconX width="12" height="12" />
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </AdminBox>
  )
}
