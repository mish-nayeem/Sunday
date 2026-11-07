import { useRef, useState } from 'react'
import useDragSort from '../lib/useDragSort.js'
import FocusDrag from './FocusDrag.jsx'
import { parseFocus, formatFocus, MAX_ZOOM } from '../lib/focus.js'
import { toLocalInput, launchLabel } from '../lib/schedule.js'
import { supabase } from '../lib/supabaseClient.js'
import { imgUrl, uploadImage } from '../lib/images.js'
import { saveProduct, deleteProduct } from '../lib/admin.js'
import { CATEGORY_LABELS } from '@/lib/catalog'
import { IconX } from './Icons.jsx'
import { stockForSizes, stockMap } from '../lib/stock.js'
import { sendRestockAlert } from '../lib/email.js'
import { parseDetails, serializeDetails, mergeLabels, rememberedLabels, rememberLabels } from '../lib/details.js'
import InfoTip from './InfoTip.jsx'
import QuickColours from './QuickColours.jsx'
import './product-form.css'

const BLANK = {
  id: '',
  sku: '',
  name: '',
  variant: '',
  price: '',
  cost: '',
  drop: '',
  category: 't_shirts',
  isNew: false,
  featured: false,
  bestSeller: false,
  images: [],
  description: '',
  sizes: ['S', 'M', 'L', 'XL'],
  sizesOut: [],
  stock: { S: 0, M: 0, L: 0, XL: 0 },
  details: '',
  sizeChart: null,
  colourGroup: '',
}

// Rows come from the DB in snake_case; the form works in the storefront's shape.
function fromRow(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    variant: row.variant,
    price: String(row.price),
    cost: row.cost != null ? String(row.cost) : '',
    drop: row.drop_name,
    category: row.category || '',
    isNew: row.is_new,
    featured: row.featured,
    bestSeller: row.best_seller,
    images: row.images ?? [],
    description: row.description ?? '',
    sizes: row.sizes ?? [],
    sizesOut: row.sizes_out ?? [],
    stock: row.stock ?? null,
    details: row.details ?? '',
    sizeChart: row.size_chart ?? null,
    colourGroup: row.colour_group ?? '',
    imageFocus: row.image_focus ?? {},
    publishAt: toLocalInput(row.publish_at),
  }
}

// The next id in the shop's own sequence: "pc" and seven digits
// (pc0000240, pc0000241, …), one past the highest pc-number already used —
// older short ones like pc239 count too, so the sequence carries on from
// them. Ids that don't follow the pattern (hand-typed names) are skipped.
export function nextProductId(ids) {
  const highest = ids.reduce((max, id) => {
    const m = /^pc(\d+)$/i.exec(String(id).trim())
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return 'pc' + String(highest + 1).padStart(7, '0')
}

function blankChart(sizes) {
  const columns = sizes.length > 0 ? sizes.map((z) => String(z).trim().toUpperCase()) : ['S', 'M', 'L', 'XL']
  return {
    columns,
    rows: [{ label: 'CHEST', values: columns.map(() => '') }],
    notes: ['Measured flat, in centimetres'],
  }
}

// The chart's columns are the sizes the product is sold in, in that order.
// A cell's value goes with its size (and row), so ticking a size off and back
// on brings its numbers back — memo holds the ones of sizes ticked off.
function chartForSizes(chart, sizes, memo = null) {
  if (!chart || !sizes?.length) return chart
  const columns = sizes.map((z) => String(z).trim().toUpperCase())
  if (columns.join('|') === (chart.columns || []).join('|')) return chart
  return {
    ...chart,
    columns,
    rows: chart.rows.map((r, ri) => {
      const had = Object.fromEntries((chart.columns || []).map((c, i) => [c, r.values[i] ?? '']))
      if (memo) {
        const kept = memo.get(ri) || {}
        for (const [c, v] of Object.entries(had)) if (v) kept[c] = v
        memo.set(ri, kept)
      }
      return { ...r, values: columns.map((c) => had[c] || memo?.get(ri)?.[c] || '') }
    }),
  }
}

// A new product starts with the boxes the last product had (Fabric, Fit…),
// values empty. A saved product starts with what it has.
function initialDetailRows(existing, labels) {
  if (existing) {
    const rows = parseDetails(existing.details)
    return rows.length > 0 ? rows : [{ label: '', value: '' }]
  }
  return labels.length > 0
    ? labels.map((label) => ({ label, value: '' }))
    : [{ label: '', value: '' }]
}

// Another colour of an existing piece: everything copied over — name, price,
// cost, drop, category, description, details, sizes, size chart, colour
// group, launch — except what differs per colour: its own id, colour name,
// photos and stock (every size back to 0).
function asNewColour(row, ids) {
  const base = fromRow(row)
  const counts = stockMap({ stock: row.stock ?? null })
  return {
    ...base,
    id: nextProductId(ids),
    sku: undefined,
    variant: '',
    images: [],
    imageFocus: {},
    sizesOut: [],
    stock: counts ? Object.fromEntries((base.sizes || []).map((s) => [s, 0])) : null,
    // In the piece's colour group — a new one for the piece if it had none
    // (the piece itself joins it on save).
    colourGroup: (row.colour_group || '').trim() || newGroupFor(row),
  }
}

// Colours of one piece share a colour group — set by + Add another colour,
// or by "Join the colours of…" in the form. The same name alone links
// nothing: two different pieces can be called the same.
export function tagOf(name) {
  return String(name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// A colour group of its own for a piece: its name and a short random tail,
// so another piece with the same name never lands in it by accident.
export function newGroupFor(p) {
  return [tagOf(p.name || ''), Math.random().toString(36).slice(2, 7).toUpperCase()].filter(Boolean).join('-')
}

// The size chart a product in this category starts with: the one on the
// most recently added product of the same category — a tee starts with the
// last tee's chart, trousers with the last trousers' — or none.
function lastChartFor(category, all, exceptId) {
  const cat = (category || '').trim().toLowerCase()
  if (!cat) return null
  const match = all
    .filter((r) => String(r.id) !== String(exceptId) && (r.category || '').trim().toLowerCase() === cat && r.size_chart?.rows?.length)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]
  return match ? JSON.parse(JSON.stringify(match.size_chart)) : null
}

// Sizes ticked on and off in the form, in this order, with their full names.
const STANDARD_SIZES = ['S', 'M', 'L', 'XL', 'XXL']
const SIZE_NAMES = { XS: 'XS · Extra small', S: 'S · Small', M: 'M · Medium', L: 'L · Large', XL: 'XL · Extra large', XXL: 'XXL' }

function FieldLabel({ tip, children }) {
  return (
    <span className="pf-flabel mono">
      {children}
      {tip && <InfoTip>{tip}</InfoTip>}
    </span>
  )
}

// One box of the form: a title (with its ⓘ) and what goes in it.
function Box({ title, tip, wide = false, children }) {
  return (
    <section className={`pf-sec ${wide ? 'wide' : ''}`}>
      <div className="pf-sec-head">
        <span className="pf-sec-title mono">{title}</span>
        {tip && <InfoTip>{tip}</InfoTip>}
      </div>
      {children}
    </section>
  )
}

export default function ProductForm({ existing, copyFrom = null, allProducts = [], existingIds = [], categories = [], categoryLabels = {}, onNewCategory, drops = [], initialDrop = '', initialPublishAt = '', detailLabels = [], startLabels = [], onDone, onCancel }) {
  const isNewRecord = !existing
  // A product added from Products → Collections starts in that collection.
  const [p, setP] = useState(() => {
    const start = existing
      ? fromRow(existing)
      : copyFrom
        ? asNewColour(copyFrom, existingIds)
        : {
            ...BLANK,
            drop: initialDrop,
            publishAt: toLocalInput(initialPublishAt),
            id: nextProductId(existingIds),
            sizeChart: lastChartFor(BLANK.category, allProducts, null),
          }
    return { ...start, sizeChart: chartForSizes(start.sizeChart, start.sizes) }
  })
  // Size-chart numbers of sizes ticked off, by row, for when they come back.
  const chartMemo = useRef(new Map())
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const categoryName = (c) => categoryLabels[c] || CATEGORY_LABELS[c] || c

  // A new category is saved to the side menu's SHOP tab at once (so it shows
  // there too), then picked for this product.
  async function addNewCategory() {
    const label = newCategory.trim()
    if (!label) return
    setCategoryBusy(true)
    setCategoryError('')
    try {
      const key = onNewCategory ? await onNewCategory(label) : label
      pickCategory(key)
      setNewCategory('')
      setAddingCategory(false)
    } catch (err) {
      setCategoryError(err.message)
    } finally {
      setCategoryBusy(false)
    }
  }
  const fileRef = useRef(null)
  // Set once a new product is saved, or from + Add another colour: the
  // piece whose other colours are being added (QuickColours).
  const [quickBase, setQuickBase] = useState(null)

  // Another product this one is to join as a colour (picked under OTHER
  // COLOURS): it gets the shared group on save, if it had none.
  const [joinWith, setJoinWith] = useState(() => (copyFrom && !(copyFrom.colour_group || '').trim() ? copyFrom.id : null))

  // The other colours this product will be shown with: its colour group.
  const group = (p.colourGroup || '').trim()
  const otherColours = allProducts.filter((r) =>
    String(r.id) !== String(p.id) && (
      (group && (r.colour_group || '').trim() === group) ||
      (joinWith && String(r.id) === String(joinWith))
    )
  )

  // Editing one colour: the piece's other colours as the form opened (its
  // colour group). Saving can pass the shared details on to them; each keeps
  // its own name, photos, colour name, stock — and a price of its own.
  const siblings = existing && (existing.colour_group || '').trim()
    ? allProducts.filter((r) => String(r.id) !== String(existing.id) && (r.colour_group || '').trim() === existing.colour_group.trim())
    : []
  const [shareWithColours, setShareWithColours] = useState(true)

  const knownLabels = mergeLabels(detailLabels, rememberedLabels())
  const [detailRows, setDetailRows] = useState(() => {
    const last = rememberedLabels()
    return initialDetailRows(existing || copyFrom, last.length ? last : startLabels)
  })

  // A product either keeps counts or it doesn't; the form shows one of two
  // states rather than a checkbox plus a dead set of inputs.
  const tracking = stockMap(p) !== null

  // The rows are the source of truth while editing; `details` is the text they
  // serialise to, kept in step so the save path stays the same as ever.
  function updateDetailRows(next) {
    setDetailRows(next)
    setP((prev) => ({ ...prev, details: serializeDetails(next) }))
  }

  function set(field, value) {
    setP((prev) => ({ ...prev, [field]: value }))
  }

  // Picking a category brings in that category's latest size chart (edit it
  // if this one differs); a category with no chart yet leaves it empty, so a
  // tee's chart never follows the product into trousers.
  function pickCategory(category) {
    setP((prev) => {
      if ((prev.category || '').trim().toLowerCase() === (category || '').trim().toLowerCase()) return { ...prev, category }
      chartMemo.current = new Map()
      return { ...prev, category, sizeChart: chartForSizes(lastChartFor(category, allProducts, prev.id), prev.sizes) }
    })
  }

  // Stock is keyed by size, so editing the size list has to carry the counts
  // across with it: sizes that stay keep their number, a new size starts at 0,
  // and a removed size drops out instead of lingering in the row.
  function setSizes(csv) {
    const sizes = csv.split(',').map((s) => s.trim()).filter(Boolean)

    setP((prev) => ({
      ...prev,
      sizes,
      stock: stockMap(prev) ? stockForSizes(prev, sizes) : prev.stock,
      sizeChart: chartForSizes(prev.sizeChart, sizes, chartMemo.current),
    }))
  }

  // Sizes ticked on and off: the usual ones plus any this product (or this
  // session) added, in that order.
  const [addingSize, setAddingSize] = useState(false)
  const [newSize, setNewSize] = useState('')
  const [extraSizes, setExtraSizes] = useState(() => (p.sizes || []).filter((z) => !STANDARD_SIZES.includes(z)))
  const sizeChoices = [...STANDARD_SIZES, ...extraSizes.filter((z) => !STANDARD_SIZES.includes(z))]

  function toggleSize(z) {
    const on = p.sizes.includes(z)
    const next = on ? p.sizes.filter((x) => x !== z) : sizeChoices.filter((x) => x === z || p.sizes.includes(x))
    setSizes(next.join(', '))
    if (on && p.sizesOut.includes(z)) set('sizesOut', p.sizesOut.filter((x) => x !== z))
  }

  function addSize() {
    const z = newSize.trim().toUpperCase()
    if (!z) return
    if (!sizeChoices.includes(z)) setExtraSizes((prev) => [...prev, z])
    if (!p.sizes.includes(z)) setSizes([...p.sizes, z].join(', '))
    setNewSize('')
    setAddingSize(false)
  }

  function toggleSizeOut(z) {
    set('sizesOut', p.sizesOut.includes(z) ? p.sizesOut.filter((x) => x !== z) : [...p.sizesOut, z])
  }

  function setStock(size, value) {
    const n = Math.max(0, Math.trunc(Number(value) || 0))
    setP((prev) => ({ ...prev, stock: { ...(prev.stock || {}), [size]: n } }))
  }

  function startTracking() {
    setP((prev) => ({ ...prev, stock: stockForSizes(prev, prev.sizes) }))
  }

  function stopTracking() {
    setP((prev) => ({ ...prev, stock: null }))
  }

  async function handleFiles(e) {
    await uploadFiles([...(e.target.files || [])])
  }

  // Photos dragged in from the computer onto the IMAGES box.
  const [dropping, setDropping] = useState(false)
  function onFilesOver(e) {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return
    e.preventDefault()
    setDropping(true)
  }
  function onFilesDrop(e) {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return
    e.preventDefault()
    setDropping(false)
    if (uploading) return
    uploadFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')))
  }

  async function uploadFiles(files) {
    if (files.length === 0) return

    setUploading(true)
    setError('')

    try {
      // One at a time, so the photos land in the order they were picked.
      const urls = []
      for (const file of files) {
        urls.push(await uploadImage(file, supabase, 'products'))
      }
      setP((prev) => ({ ...prev, images: [...prev.images, ...urls] }))
    } catch (err) {
      setError(`Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ✥ Adjust: the photo whose place in its card is being set, if any.
  const [adjusting, setAdjusting] = useState(null)
  function setFocus(url, focus) {
    setP((prev) => {
      const next = { ...(prev.imageFocus || {}) }
      if (focus) next[url] = focus
      else delete next[url]
      return { ...prev, imageFocus: next }
    })
  }

  // Drag a photo by its ⠿ (or the photo itself, with a mouse) to a new place.
  const imageDrag = useDragSort(p.images, (next) => setP((prev) => ({ ...prev, images: next })), () => {})
  const finePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches

  function removeImage(url) {
    setP((prev) => ({ ...prev, images: prev.images.filter((i) => i !== url) }))
  }

  function moveImage(index, dir) {
    setP((prev) => {
      const next = [...prev.images]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, images: next }
    })
  }

  // Puts a photo first: the one the shop card shows, with the rest after it
  // in the same order.
  function makeMain(index) {
    setP((prev) => {
      const next = [...prev.images]
      const [picked] = next.splice(index, 1)
      return { ...prev, images: [picked, ...next] }
    })
  }

  function updateChart(fn) {
    setP((prev) => ({ ...prev, sizeChart: fn(prev.sizeChart) }))
  }

  function setChartCell(rowIndex, colIndex, value) {
    updateChart((chart) => ({
      ...chart,
      rows: chart.rows.map((r, i) =>
        i !== rowIndex ? r : { ...r, values: r.values.map((v, j) => (j === colIndex ? value : v)) }
      ),
    }))
  }

  function setChartRowLabel(rowIndex, label) {
    updateChart((chart) => ({
      ...chart,
      rows: chart.rows.map((r, i) => (i === rowIndex ? { ...r, label } : r)),
    }))
  }

  function addChartRow() {
    updateChart((chart) => ({
      ...chart,
      rows: [...chart.rows, { label: '', values: chart.columns.map(() => '') }],
    }))
  }

  function removeChartRow(rowIndex) {
    updateChart((chart) => ({
      ...chart,
      rows: chart.rows.filter((_, i) => i !== rowIndex),
    }))
  }

  function validate() {
    if (!p.id.trim()) return 'Product ID is missing — reload the page and try again'
    if (!p.name.trim()) return 'Name is required'
    // The colour's name is optional — colours of a piece link by their colour group.
    if (copyFrom && p.variant.trim() && p.variant.trim().toLowerCase() === (copyFrom.variant || '').trim().toLowerCase()) {
      return `${copyFrom.name} already comes in ${copyFrom.variant} — give this colour its own name`
    }
    if (!p.price || Number(p.price) <= 0) return 'Enter a price above 0'
    if (p.images.length === 0) return 'Add at least one image'
    if (p.sizes.length === 0) return 'Add at least one size'
    if (!(p.category || '').trim()) return 'Pick a category.'
    return ''
  }

  async function handleSave() {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    setSaving(true)
    setError('')

    rememberLabels(detailRows.map((row) => row.label))

    // SKU isn't typed any more: a new product takes its id in capitals
    // (PC240), which is what the product page and cart print as its code.
    // An older product keeps whatever SKU it already had.
    const id = p.id.trim()
    // Its colour group as set in the form: kept, left (blank — a piece of
    // its own), or another piece's joined.
    const link = { group: (p.colourGroup || '').trim(), relink: joinWith ? [joinWith] : [] }
    const { error: saveError, id: savedId } = await saveProduct(
      { ...p, id, colourGroup: link.group, sku: p.sku?.trim() || id.toUpperCase(), price: Number(p.price) },
      isNewRecord
    )

    // The other colours take the same details: category, collection,
    // description, details, size chart and sizes — and the price, unless a
    // colour has a price of its own (different from this one's before the
    // edit). Their photos, colour name, stock and launch time stay their own;
    // a size added here starts at 0 for them, a size dropped here leaves them.
    if (!saveError && shareWithColours && siblings.length && link.group && link.group === (existing.colour_group || '').trim()) {
      const oldPrice = Number(existing.price)
      await Promise.all(siblings.map((r) => {
        const counts = stockMap(r) ? stockForSizes(r, p.sizes) : null
        const row = {
          price: Number(r.price) === oldPrice ? Number(p.price) : Number(r.price),
          cost_price: p.cost === '' || p.cost == null ? null : Number(p.cost),
          category: p.category || null,
          drop_name: p.drop?.trim() || null,
          description: p.description ?? '',
          details: p.details ?? '',
          size_chart: p.sizeChart ?? null,
          sizes: p.sizes,
          sizes_out: (r.sizes_out || []).filter((z) => p.sizes.includes(z)),
        }
        if (counts) {
          row.size_stock = counts
          row.quantity = Object.values(counts).reduce((n, v) => n + v, 0)
        }
        return supabase.from('products').update(row).eq('id', r.id)
      }))
    }

    // The product picked under "Join the colours of…", if it had no group yet.
    if (!saveError && link.group && link.relink.length) {
      await supabase.from('products').update({ colour_group: link.group }).in('id', link.relink)
    }

    if (saveError) {
      setSaving(false)
      setError(
        saveError.message?.includes('duplicate')
          ? 'Another product just took this ID — close the form and add it again.'
          : "Couldn't save. Check your connection and try again."
      )
      return
    }

    // Restocking is the moment the wishlist is for: any size that was at 0 and
    // now isn't gets its waiting list mailed. Done after the save so nobody is
    // told a size is back before it actually is, and never allowed to fail the
    // save — the admin panel can always send again by hand.
    const before = stockMap({ stock: existing?.stock ?? null }) || {}
    const after = stockMap(p) || {}

    // A brand new product has nothing before it and nobody waiting, so there
    // is nothing to announce.
    const restocked = isNewRecord
      ? []
      : Object.keys(after).filter(
          (size) => (after[size] ?? 0) > 0 && (before[size] ?? 0) === 0
        )

    for (const size of restocked) {
      await sendRestockAlert(p.id.trim(), size)
    }
    // Those who asked for the product as a whole (it was sold out in every
    // size) hear as soon as any size is back.
    if (restocked.length > 0) {
      await sendRestockAlert(p.id.trim(), null)
    }

    setSaving(false)

    // A new product goes straight on to its other colours, if it has any.
    if (isNewRecord) {
      setQuickBase({ ...p, id: savedId || id, colourGroup: link.group, sku: p.sku?.trim() || id.toUpperCase(), price: Number(p.price) })
      return
    }
    onDone()
  }

  async function handleDelete() {
    setSaving(true)
    const { error: delError } = await deleteProduct(p.id)
    setSaving(false)

    if (delError) {
      setError("Couldn't delete that product.")
      return
    }

    onDone()
  }

  if (quickBase) {
    return <QuickColours base={quickBase} existingIds={existingIds} onDone={onDone} />
  }

  return (
    <div className="pform">
      <div className="pform-head">
        <h3 className="display">
          {copyFrom ? `New colour — ${copyFrom.name}` : isNewRecord ? 'New product' : `Edit ${p.name}`}
        </h3>
        <div className="pf-head-actions">
          {/* Same piece, another colour: a new product with all of this one's
              details already filled in, linked to it on the product page. */}
          {!isNewRecord && (
            <button type="button" className="pf-add-colour mono" onClick={() => setQuickBase(fromRow(existing))}>
              + Add another colour
            </button>
          )}
          <button className="pf-ghost mono" onClick={onCancel}>Cancel</button>
        </div>
      </div>

      {copyFrom && (
        <div className="pf-copy-note mono">
          Everything is copied from <strong>{copyFrom.name}{copyFrom.variant ? ` — ${copyFrom.variant}` : ''}</strong>.
          Just add this colour's <strong>name</strong> (Variant / colour), its <strong>photos</strong> and
          its <strong>stock</strong>. Both colours show each other on the product page.
        </div>
      )}

      {error && <div className="pf-error mono">{error}</div>}

      {/* Every part of the form is its own box — three to a row on a
          desktop, one under the other on a phone. The longer explanations
          sit behind an ⓘ beside each title. */}
      <div className="pf-secs">
        {/* ---- Images ---- */}
        <Box
          title="IMAGES"
          wide
          tip={<>Upload every angle of the piece: <strong>front, back, a close-up, then folded or worn</strong>. The <strong>MAIN</strong> photo is the shop card; the <strong>second</strong> one shows when a customer hovers the card. On the product page all photos stack in the middle column in this order. Best size: portrait <strong>4:5</strong> (e.g. 1600 × 2000 px) on a plain light background, so every card lines up. Drag a photo (or its ⠿) to a new place, use ← →, or "Set as main". Photos can also be dragged in from the computer. <strong>✥ Adjust</strong> moves and zooms a photo inside its card.</>}
        >
          <div
            className={`pf-images ${dropping ? 'dropping' : ''}`}
            onDragOver={onFilesOver}
            onDragLeave={() => setDropping(false)}
            onDrop={onFilesDrop}
          >
            {p.images.map((url, i) => (
              <div className={`pf-img ${imageDrag.dragging === i ? 'dragging' : ''}`} key={url} {...imageDrag.row(i)}>
                <img src={imgUrl(url, { w: 200 })} alt="" draggable={false} {...(finePointer ? imageDrag.handle(i) : {})} />
                <span className="pf-img-grip" {...imageDrag.handle(i)}>⠿</span>
                {i === 0 ? (
                  <span className="pf-img-main mono">MAIN</span>
                ) : (
                  <button type="button" className="pf-img-setmain mono" onClick={() => makeMain(i)}>Set as main</button>
                )}
                <button className="pf-img-x" onClick={() => removeImage(url)} title="Remove">
                  <IconX width="13" height="13" />
                </button>
                <div className="pf-img-move mono">
                  <button onClick={() => moveImage(i, -1)} disabled={i === 0}>←</button>
                  <span>{i + 1}</span>
                  <button onClick={() => moveImage(i, 1)} disabled={i === p.images.length - 1}>→</button>
                </div>
                <button
                  type="button"
                  className={`pf-img-adjust mono ${p.imageFocus?.[url] ? 'set' : ''} ${adjusting === url ? 'on' : ''}`}
                  onClick={() => setAdjusting((a) => (a === url ? null : url))}
                  title="Move and zoom the photo inside its card, like a Facebook cover"
                >
                  ✥ {p.imageFocus?.[url] ? 'Adjusted' : 'Adjust'}
                </button>
              </div>
            ))}

            <label className={`pf-upload mono ${uploading ? 'busy' : ''}`}>
              {uploading ? 'Uploading…' : dropping ? 'Drop to upload' : '+ Add images'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFiles}
                disabled={uploading}
              />
            </label>
          </div>

          {/* The photo in the shop card's own shape (4:5), dragged until the
              part you want is in frame — a small or wide photo then fills
              the card with no empty bars. */}
          {adjusting && p.images.includes(adjusting) && (
            <div className="pf-focus">
              <FocusDrag
                className="pf-focus-frame"
                zoom
                src={imgUrl(adjusting, { w: 1000 })}
                value={p.imageFocus?.[adjusting] || '50% 50%'}
                onChange={(focus) => setFocus(adjusting, focus)}
              />
              <div className="pf-focus-side">
                <p className="pf-focus-note">
                  This is the photo as its <strong>shop card</strong> shows it. Drag it up, down or sideways until the
                  right part is in the frame, and zoom in to make it bigger. The same framing is used on the product
                  page. Press <strong>Save changes</strong> at the bottom to keep it.
                </p>
                {(() => {
                  const [fx, fy, fz] = parseFocus(p.imageFocus?.[adjusting] || '50% 50%')
                  const zoomTo = (z) => setFocus(adjusting, formatFocus(fx, fy, z))
                  return (
                    <div className="pf-zoom">
                      <span className="pf-zoom-label mono">Zoom</span>
                      <button type="button" className="pf-zoom-btn mono" aria-label="Zoom out" disabled={fz <= 1} onClick={() => zoomTo(fz - 0.1)}>−</button>
                      <input
                        type="range"
                        className="pf-zoom-range"
                        aria-label="Zoom"
                        min="1"
                        max={MAX_ZOOM}
                        step="0.01"
                        value={fz}
                        onChange={(e) => zoomTo(Number(e.target.value))}
                      />
                      <button type="button" className="pf-zoom-btn mono" aria-label="Zoom in" disabled={fz >= MAX_ZOOM} onClick={() => zoomTo(fz + 0.1)}>+</button>
                      <span className="pf-zoom-val mono">{Math.round(fz * 100)}%</span>
                      {(fz > 1 || fx !== 50 || fy !== 50) && (
                        <button type="button" className="pf-zoom-reset mono" onClick={() => setFocus(adjusting, '50% 50%')}>
                          Reset
                        </button>
                      )}
                    </div>
                  )
                })()}
                <div className="pf-focus-acts">
                  {p.imageFocus?.[adjusting] && (
                    <button type="button" className="pf-colour-btn mono" onClick={() => setFocus(adjusting, null)}>
                      Back to centred
                    </button>
                  )}
                  <button type="button" className="pf-colour-btn mono" onClick={() => setAdjusting(null)}>Done</button>
                </div>
              </div>
            </div>
          )}
        </Box>

        {/* ---- ID, price, cost ---- */}
        <Box title="CODE & PRICE">
          <label className="pf-field">
            <FieldLabel
              tip={isNewRecord
                ? 'Given automatically — the next number after your last product. Also used as its code (SKU).'
                : "ID can't be changed after creation. It's also the product's code (SKU)."}
            >
              PRODUCT ID
            </FieldLabel>
            <input value={p.id} disabled readOnly />
          </label>

          <label className="pf-field">
            <FieldLabel>PRICE (৳)</FieldLabel>
            <input
              type="number"
              value={p.price}
              onChange={(e) => set('price', e.target.value)}
              placeholder="1200"
            />
          </label>

          <label className="pf-field">
            <FieldLabel tip="What it cost to make or buy in. Used for the Cost & margin panel — never shown to customers.">
              COST (৳, OPTIONAL)
            </FieldLabel>
            <input
              type="number"
              value={p.cost ?? ''}
              onChange={(e) => set('cost', e.target.value)}
              placeholder="What it cost you"
            />
          </label>
        </Box>

        {/* ---- Name & colour ---- */}
        <Box title="NAME & COLOUR">
          <label className="pf-field">
            <FieldLabel>PRODUCT NAME</FieldLabel>
            <input value={p.name} onChange={(e) => set('name', e.target.value)} placeholder="Heavyweight Tee" />
          </label>

          <label className="pf-field">
            <FieldLabel tip="The colour of this one, e.g. Navy. Shown under the name on the product page and as the name of its swatch.">COLOUR NAME (OPTIONAL)</FieldLabel>
            <input value={p.variant} onChange={(e) => set('variant', e.target.value)} placeholder="Bone White" />
          </label>

          {/* Colours link only on purpose — + Add another colour, or the
              picker here. The same name alone joins nothing. */}
          <div className="pf-field">
            <FieldLabel tip="The other colours of this piece: each colour is its own card in the shop with small colour swatches under it, and the product page shows a swatch for every colour. Use + Add another colour at the top, or join an existing product here. A product that only shares the name stays on its own.">
              OTHER COLOURS
            </FieldLabel>
            <div className="pf-colours mono">
              {otherColours.length
                ? otherColours.map((c) => [c.name, c.variant].filter(Boolean).join(' — ') || c.id).join(' · ')
                : 'None — this product is on its own'}
            </div>
            <div className="pf-colour-acts">
              {otherColours.length > 0 && (
                <button type="button" className="pf-colour-btn mono" onClick={() => { set('colourGroup', ''); setJoinWith(null) }}>
                  Keep this product on its own
                </button>
              )}
              <select
                className="pf-colour-pick mono"
                value=""
                onChange={(e) => {
                  const r = allProducts.find((x) => String(x.id) === e.target.value)
                  if (!r) return
                  if ((r.colour_group || '').trim()) {
                    set('colourGroup', r.colour_group.trim())
                    setJoinWith(null)
                  } else {
                    set('colourGroup', newGroupFor(r))
                    setJoinWith(r.id)
                  }
                }}
              >
                <option value="">Join the colours of…</option>
                {allProducts
                  .filter((r) => String(r.id) !== String(p.id) && !otherColours.some((c) => String(c.id) === String(r.id)))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {[r.name, r.variant].filter(Boolean).join(' — ')} ({String(r.sku || r.id).toUpperCase()})
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </Box>

        {/* ---- Collection / drop ---- */}
        <Box title="COLLECTION / DROP" tip="Optional — a product with no collection shows in the shop under its category as usual. Group pieces released together, e.g. EID 2026. A drop gets its own page (Shop → Drops in the menu) and its own lookbook. Pick an existing one so the spelling matches, or type a new name.">
          {drops.length > 0 && (
            <div className="pf-cats">
              {/* A product needn't be in a collection: it shows in the shop
                  under its category all the same. */}
              <button
                type="button"
                className={`pf-cat ${!(p.drop || '').trim() ? 'on' : ''}`}
                onClick={() => set('drop', '')}
              >
                <span className="pf-box" />
                No collection
              </button>
              {[...new Set([...drops, p.drop].filter(Boolean))].map((d) => (
                <button
                  type="button"
                  key={d}
                  className={`pf-cat ${p.drop === d ? 'on' : ''}`}
                  onClick={() => set('drop', p.drop === d ? '' : d)}
                >
                  <span className="pf-box" />
                  {d}
                </button>
              ))}
            </div>
          )}
          <div className="pf-field">
            <input
              value={p.drop || ''}
              onChange={(e) => set('drop', e.target.value)}
              placeholder={drops.length ? 'Or type a name' : 'e.g. EID 2026'}
            />
          </div>
        </Box>

        {/* ---- Category ---- */}
        <Box title="CATEGORY" tip="Where the product shows in the shop: pick one, or + New category to make another (e.g. Tracksuits). A new category is added to Side menu → SHOP at once, and one made there shows here too. Bags and belts can be tagged in lookbook photos like any piece. Picking a category also fills in the size chart from the last product in it.">
          <div className="pf-cats">
            {[...new Set([...categories, p.category].filter(Boolean))].sort((a, b) => categoryName(a).localeCompare(categoryName(b))).map((c) => (
              <button
                type="button"
                key={c}
                className={`pf-cat ${p.category === c ? 'on' : ''}`}
                onClick={() => pickCategory(c)}
              >
                <span className="pf-box" />
                {categoryName(c)}
              </button>
            ))}
            {!addingCategory && (
              <button type="button" className="pf-cat pf-cat-new" onClick={() => setAddingCategory(true)}>
                + New category
              </button>
            )}
          </div>

          {addingCategory && (
            <div className="pf-newcat">
              <input
                className="mono"
                autoFocus
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNewCategory() } }}
                placeholder="e.g. Tracksuits"
                disabled={categoryBusy}
              />
              <button
                type="button"
                className="pf-newcat-add mono"
                disabled={categoryBusy || !newCategory.trim()}
                onClick={addNewCategory}
              >
                {categoryBusy ? 'Adding…' : 'Add'}
              </button>
              <button
                type="button"
                className="pf-ghost mono"
                onClick={() => {
                  setNewCategory('')
                  setCategoryError('')
                  setAddingCategory(false)
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {categoryError && <div className="err-banner mono">{categoryError}</div>}
        </Box>

        {/* ---- Description ---- */}
        <Box title="DESCRIPTION" tip="Two or three plain sentences: fabric, fit, what it's for. Shown first under Product details on the product page.">
          <div className="pf-field">
            <textarea
              rows={5}
              value={p.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Fabric, fit, what makes it worth buying."
            />
          </div>
        </Box>

        {/* ---- Details ---- */}
        <Box
          title="DETAILS"
          tip={<>Box name on the left (Fabric, Fit…), the detail on the right. Customers see only what's on the right — "Fabric | 100% cotton" shows as "100% cotton". Leave the right side empty and that row isn't shown. A new product starts with the last product's boxes; add one with + Add box, drop one with ×.</>}
        >
          <div className="pf-detail-grid">
            {detailRows.map((row, i) => (
              <div className="pf-detail-row" key={i}>
                <input
                  className="mono"
                  list="pf-detail-labels"
                  value={row.label}
                  onChange={(e) =>
                    updateDetailRows(detailRows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  placeholder="Fabric"
                />
                <input
                  value={row.value}
                  onChange={(e) =>
                    updateDetailRows(detailRows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                  placeholder="100% cotton"
                />
                <button
                  type="button"
                  className="pf-chart-x"
                  onClick={() => {
                    const next = detailRows.filter((_, j) => j !== i)
                    updateDetailRows(next.length > 0 ? next : [{ label: '', value: '' }])
                  }}
                  title="Remove row"
                >
                  <IconX width="12" height="12" />
                </button>
              </div>
            ))}
          </div>

          <datalist id="pf-detail-labels">
            {knownLabels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>

          <button
            type="button"
            className="pf-chart-add mono"
            onClick={() => updateDetailRows([...detailRows, { label: '', value: '' }])}
          >
            + Add box
          </button>
        </Box>

        {/* ---- Sizes ---- */}
        <Box title="SIZES AVAILABLE" tip="Tick the sizes this product comes in; + Add size for one that isn't listed. Under it, tick a size to strike it through on the page whatever the stock count says — a size that runs out sells out by itself.">
          <div className="pf-sizes">
            {sizeChoices.map((z) => (
              <button
                type="button"
                key={z}
                className={`pf-cat ${p.sizes.includes(z) ? 'on' : ''}`}
                onClick={() => toggleSize(z)}
              >
                <span className="pf-box" />
                {SIZE_NAMES[z] || z}
              </button>
            ))}
          </div>

          {addingSize ? (
            <div className="pf-newcat">
              <input
                className="mono"
                autoFocus
                value={newSize}
                onChange={(e) => setNewSize(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSize() } }}
                placeholder="E.G. 3XL, 32, FREE"
              />
              <button type="button" className="pf-newcat-add mono" onClick={addSize}>Add</button>
              <button type="button" className="pf-ghost mono" onClick={() => { setNewSize(''); setAddingSize(false) }}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="pf-chart-add mono" onClick={() => setAddingSize(true)}>
              + Add size
            </button>
          )}

          {p.sizes.length > 0 && (
            <div className="pf-field">
              <FieldLabel tip="Struck through on the product page whatever the count says — for a size you've put aside. A size that runs out sells out on its own.">
                STRUCK THROUGH ON THE PAGE
              </FieldLabel>
              <div className="pf-sizes">
                {p.sizes.map((z) => (
                  <button
                    type="button"
                    key={z}
                    className={`pf-cat off ${p.sizesOut.includes(z) ? 'on' : ''}`}
                    onClick={() => toggleSizeOut(z)}
                  >
                    <span className="pf-box" />
                    {z}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Box>

        {/* ---- Stock ---- */}
        <Box title="STOCK" tip="Pieces on the shelf in each size. A size comes off the count when its order is marked Delivered. At 0 the size shows sold out, and customers can ask to be emailed when it's back; raising it from 0 mails them. Turn counting off and the product sells with no limit.">
          {p.sizes.length === 0 ? (
            <div className="pf-note mono">Tick a size first to count stock for it.</div>
          ) : !tracking ? (
            <button type="button" className="pf-add mono" onClick={startTracking}>
              + Count stock for this product
            </button>
          ) : (
            <>
              <div className="pf-stock-list">
                {p.sizes.map((size) => {
                  const count = Number(p.stock?.[size] ?? 0)
                  return (
                    <label className="pf-stock-line" key={size}>
                      <span className="mono">{SIZE_NAMES[size] || size}</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className={count === 0 ? 'zero' : ''}
                        value={String(count)}
                        onChange={(e) => setStock(size, e.target.value)}
                      />
                    </label>
                  )
                })}
              </div>
              <div className="pf-stock-total mono">
                Total {p.sizes.reduce((n, z) => n + Number(p.stock?.[z] ?? 0), 0)} pieces
              </div>
              <button type="button" className="pf-remove mono" onClick={stopTracking}>
                Stop counting stock
              </button>
            </>
          )}
        </Box>

        {/* ---- Launch & badges ---- */}
        <Box title="GOES LIVE & BADGES" tip="Leave the time empty to show the product as soon as it's saved. Set a time to keep it hidden from the shop until then — e.g. a drop at 10 pm — and it appears by itself.">
          <div className="pf-field pf-launch">
            <FieldLabel>GOES LIVE AT (OPTIONAL)</FieldLabel>
            <input
              type="datetime-local"
              value={p.publishAt || ''}
              onChange={(e) => set('publishAt', e.target.value)}
            />
            {p.publishAt && (
              <button type="button" className="pf-ghost mono pf-launch-clear" onClick={() => set('publishAt', '')}>
                Clear — live now
              </button>
            )}
            {p.publishAt && new Date(p.publishAt) > new Date() && (
              <em className="pf-hint mono">
                Hidden from the shop until {launchLabel(new Date(p.publishAt).toISOString())}.
              </em>
            )}
          </div>

          <div className="pf-flags">
            <label className="pf-check mono">
              <input type="checkbox" checked={p.isNew} onChange={(e) => set('isNew', e.target.checked)} />
              New arrival
              <InfoTip>Shows a NEW tag on the shop card, and puts the product on the New arrivals page and the New arrivals row on the home page. Untick it once the piece is no longer new.</InfoTip>
            </label>
            <label className="pf-check mono">
              <input type="checkbox" checked={p.bestSeller} onChange={(e) => set('bestSeller', e.target.checked)} />
              Best seller
              <InfoTip>Puts the product on the Best sellers page (Shop → Best sellers) and in the Best sellers row at the bottom of the home page. Pick 4 or more so the row is full.</InfoTip>
            </label>
          </div>
        </Box>

        {/* ---- Size chart ---- */}
        <Box
          title="SIZE CHART"
          wide
          tip={<>Each product carries its own chart — a shirt and trousers don't measure the same way. Picking a category fills in the chart from the last product in that category ({p.category || 'none picked'}); change it if this one differs. It shows under Sizing on the product page and in its Size guide popup; without one, the shop's standard chart is used.</>}
        >
          {!p.sizeChart ? (
            <button
              type="button"
              className="pf-chart-add mono"
              onClick={() => set('sizeChart', blankChart(p.sizes))}
            >
              + Add a size chart
            </button>
          ) : (
            <div className="pf-chart">
              {/* The columns are the sizes ticked under Sizes available. */}
              <div className="pf-chart-cols mono">
                COLUMNS · {p.sizeChart.columns.join(' · ')}
                <InfoTip>The chart has one column per size ticked under Sizes available, in the same order. Tick a size on or off there and its column comes or goes here — numbers typed for a size come back if it's ticked on again.</InfoTip>
              </div>

              <div className="pf-chart-grid">
                <div
                  className="pf-chart-row head mono"
                  style={{ gridTemplateColumns: `150px repeat(${p.sizeChart.columns.length}, 1fr) 30px` }}
                >
                  <span>MEASUREMENT</span>
                  {p.sizeChart.columns.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                  <span />
                </div>

                {p.sizeChart.rows.map((row, ri) => (
                  <div
                    className="pf-chart-row"
                    key={ri}
                    style={{ gridTemplateColumns: `150px repeat(${p.sizeChart.columns.length}, 1fr) 30px` }}
                  >
                    <input
                      className="mono"
                      value={row.label}
                      onChange={(e) => setChartRowLabel(ri, e.target.value.toUpperCase())}
                      placeholder="CHEST"
                    />
                    {p.sizeChart.columns.map((c, ci) => (
                      <input
                        key={c}
                        className="mono"
                        value={row.values[ci] ?? ''}
                        onChange={(e) => setChartCell(ri, ci, e.target.value)}
                        placeholder="—"
                      />
                    ))}
                    <button
                      type="button"
                      className="pf-chart-x"
                      onClick={() => removeChartRow(ri)}
                      title="Remove row"
                    >
                      <IconX width="12" height="12" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pf-chart-actions">
                <button type="button" className="pf-chart-add mono" onClick={addChartRow}>
                  + Add measurement
                </button>
                <button
                  type="button"
                  className="pf-ghost danger mono"
                  onClick={() => set('sizeChart', null)}
                >
                  Remove chart
                </button>
              </div>

              <label className="pf-field">
                <FieldLabel tip="One line per note, shown under the chart.">CHART NOTES</FieldLabel>
                <textarea
                  rows={3}
                  value={(p.sizeChart.notes || []).join('\n')}
                  onChange={(e) =>
                    updateChart((chart) => ({
                      ...chart,
                      notes: e.target.value.split('\n'),
                    }))
                  }
                  placeholder={'Measured flat, in centimetres\nChest measured as circumference'}
                />
              </label>
            </div>
          )}
        </Box>
      </div>

      {siblings.length > 0 && (
        <label className="pf-share mono">
          <input type="checkbox" checked={shareWithColours} onChange={(e) => setShareWithColours(e.target.checked)} />
          <span>
            Use these details for the other {siblings.length === 1 ? 'colour' : `${siblings.length} colours`} too
            ({siblings.map((c) => c.variant || c.name || c.id).join(', ')}) — price, category, collection, description,
            details, size chart and sizes. Their own name, photos, colour name and stock stay as they are — and a colour with a price of its own keeps it.
          </span>
        </label>
      )}

      {/* ---- Actions ---- */}
      <div className="pf-actions">
        <button className="pf-save mono" onClick={handleSave} disabled={saving || uploading}>
          {saving ? 'Saving…' : isNewRecord ? 'Create product' : 'Save changes'}
        </button>

        {!isNewRecord && (
          confirmDelete ? (
            <div className="pf-confirm mono">
              <span>Delete permanently?</span>
              <button className="pf-danger" onClick={handleDelete} disabled={saving}>Yes, delete</button>
              <button className="pf-ghost" onClick={() => setConfirmDelete(false)}>No</button>
            </div>
          ) : (
            <button className="pf-ghost danger mono" onClick={() => setConfirmDelete(true)}>
              Delete product
            </button>
          )
        )}
      </div>
    </div>
  )
}
