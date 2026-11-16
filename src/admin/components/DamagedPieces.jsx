import { useMemo, useState } from 'react'
import AdminBox from './AdminBox.jsx'
import { imgUrl } from '../lib/images.js'
import { damagedPieces, taka } from '../lib/damaged.js'
import './damaged-pieces.css'

// Products / Inventory → Damaged: every piece that came back faulty or
// damaged (Support → Returns, reason "faulty" / "damaged"). Those pieces
// never go back into stock (admin_process_return), so this is where they
// show — what it cost to make them is the production loss. As on PAUSE.
//
// Read from the return requests already loaded with the admin: each done
// request's resolution lists its pieces with `damaged: true`
// (admin_process_return sets it; src/admin/lib/damaged.js reads it).

const RANGES = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: '90', label: 'Last 90 days' },
]

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export default function DamagedPieces({ returns, products, onOpenOrder }) {
  const [range, setRange] = useState('all')
  const byId = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products])

  const pieces = useMemo(() => damagedPieces(returns, byId), [returns, byId])

  const shown = useMemo(() => {
    if (range === 'all') return pieces
    const now = new Date()
    const since = range === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : Date.now() - 90 * 86400000
    return pieces.filter((d) => new Date(d.at).getTime() >= since)
  }, [pieces, range])

  const total = shown.reduce((a, d) => ({
    qty: a.qty + d.qty,
    loss: a.loss + (d.cost != null ? d.cost * d.qty : 0),
    value: a.value + d.price * d.qty,
    noCost: a.noCost + (d.cost == null ? d.qty : 0),
  }), { qty: 0, loss: 0, value: 0, noCost: 0 })

  // By product: which ones come back damaged most — a sewing or packing problem.
  const byProduct = useMemo(() => {
    const m = new Map()
    for (const d of shown) {
      const k = `${d.name}|${d.variant}`
      const e = m.get(k) || { name: d.name, variant: d.variant, product: d.product, qty: 0, loss: 0, costed: false, sizes: new Map() }
      e.qty += d.qty
      if (d.cost != null) e.costed = true
      e.loss += d.cost != null ? d.cost * d.qty : 0
      e.sizes.set(d.size, (e.sizes.get(d.size) || 0) + d.qty)
      m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty)
  }, [shown])

  return (
    <div className="dmg">
      <div className="dmg-range chips mono">
        {RANGES.map((r) => (
          <button key={r.key} type="button" className={`chip ${range === r.key ? 'on' : ''}`} onClick={() => setRange(r.key)}>{r.label.toUpperCase()}</button>
        ))}
      </div>

      <div className="dmg-kpis">
        <div className="dmg-kpi"><span className="mono">DAMAGED PIECES</span><b>{total.qty}</b></div>
        <div className="dmg-kpi"><span className="mono">PRODUCTION LOSS</span><b>{taka(total.loss)}</b>{total.noCost > 0 && <em className="mono">{total.noCost} without a cost — add it in the product form</em>}</div>
        <div className="dmg-kpi"><span className="mono">SALE VALUE</span><b>{taka(total.value)}</b><em className="mono">what they'd have sold for</em></div>
      </div>

      <AdminBox
        wide
        title="DAMAGED PIECES"
        tip={
          <>
            <p>Every piece that came back <b>faulty or damaged</b> through Support → Returns. They don't go back into stock, so they show here instead.</p>
            <p><b>Production loss</b> = the product's cost (product form → Cost) × pieces. <b>Sale value</b> = what they were sold for.</p>
            <p>Fixed one and selling it again? Add it back to the size's stock by hand in the product form.</p>
          </>
        }
      >
        {shown.length === 0 ? (
          <div className="ab-empty mono">No damaged pieces{range === 'all' ? ' yet' : ' in these dates'}.</div>
        ) : (
          <ul className="dmg-list">
            {shown.map((d) => (
              <li key={d.key} className="dmg-row">
                <span className="dmg-thumb">{d.product?.images?.[0] && <img src={imgUrl(d.product.images[0], { w: 120 })} alt="" loading="lazy" />}</span>
                <span className="dmg-main">
                  <b>{d.name}</b>
                  <span className="mono dim">{[d.variant, `size ${d.size}`, `× ${d.qty}`].filter(Boolean).join(' · ')}</span>
                  <span className="mono dim">{d.reason}{d.note ? ` — ${d.note}` : ''}</span>
                  <span className="mono">
                    {day(d.at)} · <button type="button" className="dmg-order" onClick={() => onOpenOrder?.(d.orderId)}>{d.orderId}</button>{d.customer ? ` · ${d.customer}` : ''} · {d.outcome}
                  </span>
                </span>
                <span className="dmg-money mono">
                  <b>{d.cost != null ? `− ${taka(d.cost * d.qty)}` : 'no cost'}</b>
                  <span className="dim">sold at {taka(d.price * d.qty)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminBox>

      {byProduct.length > 1 && (
        <AdminBox wide title="BY PRODUCT" tip="Which products come back damaged most — worth a word with the workshop, or a look at the packing.">
          <ul className="dmg-list">
            {byProduct.map((e) => (
              <li key={`${e.name}|${e.variant}`} className="dmg-row">
                <span className="dmg-thumb">{e.product?.images?.[0] && <img src={imgUrl(e.product.images[0], { w: 120 })} alt="" loading="lazy" />}</span>
                <span className="dmg-main">
                  <b>{e.name}</b>
                  <span className="mono dim">{[e.variant, [...e.sizes].map(([s, n]) => `${s} × ${n}`).join(', ')].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="dmg-money mono"><b>{e.qty} pc</b><span className="dim">{e.costed ? `− ${taka(e.loss)}` : 'no cost'}</span></span>
              </li>
            ))}
          </ul>
        </AdminBox>
      )}
    </div>
  )
}
