import { useEffect, useMemo, useState } from 'react'
import AdminBox from './AdminBox.jsx'
import InfoTip from './InfoTip.jsx'
import { blockCustomer, unblockCustomer, fetchSafety, saveSafety } from '../lib/safety.js'
import { bdPhone } from '../../lib/phone.js'
import { customerIndex, lookupCustomer } from '../lib/admin.js'
import './security.css'

const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Orders → Security: everything that keeps fake orders out, in one place —
// what checkout checks by itself, the switch for risky numbers, the block
// list, and every order attempt that was turned away.
export default function SecurityManager({ orders, blockList, setBlockList, attempts, listError }) {
  const [safety, setSafety] = useState({ risky_advance: true })
  const [kind, setKind] = useState('phone')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchSafety().then(setSafety) }, [])

  // Numbers the shop's own history calls risky (refused or cancelled twice,
  // or more often than delivered) — the ones the switch asks to pay first.
  const risky = useMemo(() => {
    const index = customerIndex(orders)
    const seen = new Map()
    for (const o of orders) {
      const phone = bdPhone(o.customer_phone)
      if (!phone || seen.has(phone)) continue
      const h = lookupCustomer(index, o.customer_phone)
      if (h.level === 'risk') seen.set(phone, { phone, name: o.customer_name, ...h })
    }
    return [...seen.values()].sort((a, b) => b.cancelled - a.cancelled)
  }, [orders])

  async function toggleSafety() {
    const next = { ...safety, risky_advance: !safety.risky_advance }
    setSafety(next)
    const { error } = await saveSafety(next)
    setNote(error ? "Couldn't save the switch — try again." : next.risky_advance ? 'On: risky numbers pay Tk 200 first, in Dhaka too.' : 'Off: risky numbers in Dhaka can pay cash on delivery.')
  }

  async function add(e, k = kind, v = value, r = reason) {
    e?.preventDefault()
    setBusy(true)
    const { row, error } = await blockCustomer(k, v, r)
    setBusy(false)
    if (error) return setNote(error)
    setBlockList((list) => [row, ...list.filter((b) => b.id !== row.id)])
    setValue('')
    setReason('')
    setNote(`${row.value} is blocked — it can't order on the website any more.`)
  }

  async function remove(b) {
    const { error } = await unblockCustomer(b.id)
    if (error) return setNote(error)
    setBlockList((list) => list.filter((x) => x.id !== b.id))
    setNote(`${b.value} can order again.`)
  }

  const blockedPhones = new Set(blockList.filter((b) => b.kind === 'phone').map((b) => b.value))

  return (
    <div className="ab-grid">
      <AdminBox
        wide
        title="WHAT CHECKOUT CHECKS BY ITSELF"
        tip={<>
          <p>Every website order passes these before it's saved — nothing to switch on:</p>
          <p><b>Phone number:</b> must be a Bangladeshi mobile (11 digits, 01…). +880, spaces and dashes are fine; it's saved as 01XXXXXXXXX so one customer's orders always match.</p>
          <p><b>Too many orders:</b> one internet connection can place at most 10 orders an hour. More are turned away and listed under Turned-away attempts below.</p>
          <p><b>Outside Dhaka:</b> Tk 200 by bKash up front, with the Transaction ID — check it in Orders → bKash check.</p>
          <p><b>Block list</b> and <b>risky numbers</b>: the boxes below.</p>
          <p>Orders you type in yourself (+ New order) skip all of this.</p>
        </>}
      >
        <ul className="sec-checks">
          <li><span className="sec-dot on" />Bangladeshi mobile numbers only</li>
          <li><span className="sec-dot on" />At most 10 orders an hour from one connection</li>
          <li><span className="sec-dot on" />Outside Dhaka pays Tk 200 by bKash first</li>
          <li><span className={`sec-dot ${safety.risky_advance ? 'on' : ''}`} />Risky numbers pay Tk 200 first, in Dhaka too {safety.risky_advance ? '' : '(off)'}</li>
          <li><span className="sec-dot on" />{blockList.length} blocked {blockList.length === 1 ? 'number or connection' : 'numbers or connections'}</li>
        </ul>
      </AdminBox>

      <AdminBox
        title="RISKY NUMBERS PAY FIRST"
        tip={<>
          <p>A number is <b>risky</b> when its parcels came back: refused or cancelled twice, or more often than delivered (the red “CANCELLED” tag on order cards).</p>
          <p><b>On:</b> at checkout a risky number can't choose cash on delivery, even in Dhaka — it pays Tk 200 by bKash up front (or the whole order), so a refused parcel no longer costs you the delivery.</p>
          <p><b>Off:</b> risky numbers in Dhaka can pay cash on delivery like everyone else.</p>
          <p>The customer only sees “This order needs Tk 200 up front” — never that they were marked.</p>
        </>}
        side={`${risky.length} risky`}
      >
        <label className="sec-switch">
          <input type="checkbox" checked={safety.risky_advance} onChange={toggleSafety} />
          <span className="sec-track" aria-hidden="true" />
          <span>{safety.risky_advance ? 'On — risky numbers pay Tk 200 first' : 'Off'}</span>
        </label>
        {risky.length === 0 ? (
          <div className="empty mono">No risky numbers yet.</div>
        ) : (
          <div className="sec-list">
            {risky.slice(0, 30).map((r) => (
              <div className="sec-row" key={r.phone}>
                <div>
                  <div className="mini-name">{r.name || '—'}</div>
                  <div className="mono dim">{r.phone} · {r.total} orders · {r.delivered} delivered · {r.cancelled} cancelled/returned</div>
                </div>
                {blockedPhones.has(r.phone)
                  ? <span className="sec-tag mono">BLOCKED</span>
                  : <button type="button" className="ab-btn ghost" onClick={() => add(null, 'phone', r.phone, `${r.cancelled} cancelled/returned`)}>Block</button>}
              </div>
            ))}
          </div>
        )}
      </AdminBox>

      <AdminBox
        title="BLOCK LIST"
        tip={<>
          <p>A blocked <b>phone number</b> or <b>internet connection (IP)</b> can't place an order on the website. They see “We couldn't take this order online. Please call or message us” — the try is listed under Turned-away attempts.</p>
          <p>Add one here, or press <b>Block this number</b> inside any order. Write a reason so you remember why.</p>
          <p>An IP is best for someone placing many fake orders under different numbers: copy it from Turned-away attempts. Mobile data IPs change and can be shared, so block an IP only for a while.</p>
          <p><b>Unblock</b> lets them order again straight away.</p>
        </>}
        side={`${blockList.length}`}
      >
        <form className="sec-form" onSubmit={add}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="ab-input" aria-label="What to block">
            <option value="phone">Phone number</option>
            <option value="ip">IP address</option>
          </select>
          <input className="ab-input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === 'phone' ? '01XXXXXXXXX' : 'e.g. 103.15.42.7'} aria-label={kind === 'phone' ? 'Phone number' : 'IP address'} />
          <input className="ab-input sec-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional) — e.g. 3 fake orders" aria-label="Reason" />
          <button type="submit" className="ab-btn" disabled={busy || !value.trim()}>Block</button>
        </form>
        {listError && <div className="sec-err mono">{listError}</div>}
        {blockList.length === 0 && !listError && <div className="empty mono">Nobody is blocked.</div>}
        <div className="sec-list">
          {blockList.map((b) => (
            <div className="sec-row" key={b.id}>
              <div>
                <div className="mini-name mono">{b.value}</div>
                <div className="mono dim">{b.kind === 'phone' ? 'Phone' : 'IP'} · {when(b.created_at)}{b.reason ? ` · ${b.reason}` : ''}</div>
              </div>
              <button type="button" className="ab-btn ghost" onClick={() => remove(b)}>Unblock</button>
            </div>
          ))}
        </div>
      </AdminBox>

      <AdminBox
        wide
        title="TURNED-AWAY ATTEMPTS"
        tip={<>
          <p>Every website order that was refused, newest first, with the name, phone, email and internet connection (IP) it came with.</p>
          <p><b>Too many orders:</b> more than 10 in an hour from one connection — usually someone testing or spamming.</p>
          <p><b>Blocked:</b> a number or connection on your block list tried again.</p>
          <p>The same IP again and again with different numbers is a sign of fake orders: <b>Block IP</b> stops that connection.</p>
        </>}
        side={`${attempts.length}`}
      >
        {attempts.length === 0 && <div className="empty mono">Nothing turned away yet.</div>}
        <div className="sec-list">
          {attempts.map((a) => (
            <div className="sec-row" key={a.id}>
              <div>
                <div className="mini-name">
                  {a.name || 'No name given'}
                  <span className={`sec-why mono ${a.action === 'blocked_customer' ? 'blocked' : ''}`}>{a.action === 'blocked_customer' ? 'BLOCKED' : 'TOO MANY'}</span>
                </div>
                <div className="mono dim">{a.phone || '—'}{a.email ? ` · ${a.email}` : ''} · {a.ip || 'unknown IP'} · {when(a.created_at)}</div>
              </div>
              {a.ip && !blockList.some((b) => b.kind === 'ip' && b.value === a.ip) && (
                <button type="button" className="ab-btn ghost" onClick={() => add(null, 'ip', a.ip, 'From turned-away attempts')}>Block IP</button>
              )}
            </div>
          ))}
        </div>
      </AdminBox>

      {note && <div className="sec-note mono" role="status">{note} <InfoTip>Changes work straight away for new orders.</InfoTip></div>}
    </div>
  )
}
