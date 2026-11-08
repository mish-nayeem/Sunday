import { useEffect, useState } from 'react'
import { fetchMenuOptions, saveMenuOptions } from '../lib/navCategories.js'
import AdminBox from './AdminBox.jsx'
import './category-manager.css'

// Admin → Side menu → the rest of the ☰ menu: SHOP's "Shop by collection"
// and the small links under both tabs, each shown or hidden.
const ITEMS = [
  { key: 'shopByCollection', label: 'SHOP BY COLLECTION', where: 'SHOP tab · under your rows, lists the drops' },
  { key: 'links.wishlist', label: 'WISHLIST', where: 'Small links at the bottom' },
  { key: 'links.track', label: 'TRACK AN ORDER', where: 'Small links at the bottom' },
  { key: 'links.returns', label: 'RETURNS AND EXCHANGES', where: 'Small links at the bottom' },
]

const read = (o, key) => key.split('.').reduce((v, k) => v?.[k], o) !== false
function write(o, key, on) {
  const [a, b] = key.split('.')
  return b ? { ...o, [a]: { ...o[a], [b]: on } } : { ...o, [a]: on }
}

export default function MenuOptions() {
  const [options, setOptions] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchMenuOptions().then(({ options }) => setOptions(options)) }, [])

  async function toggle(key) {
    // Read fresh, so a tab marked as customised meanwhile isn't undone.
    setBusy(true)
    setError('')
    const { options: now } = await fetchMenuOptions()
    const next = write(now, key, !read(now, key))
    const { error } = await saveMenuOptions(next)
    if (error) setError("Couldn't save that — try again.")
    else setOptions(next)
    setBusy(false)
  }

  const shown = options ? ITEMS.filter((i) => read(options, i.key)).length : 0
  return (
    <AdminBox
      title="MORE IN THE MENU"
      side={options ? `${shown} of ${ITEMS.length} showing` : ''}
      tip={<p>The parts of the ☰ menu that aren’t rows above: SHOP’s “Shop by collection”, and the small links at the bottom of both tabs. Showing/Hidden takes one off the site straight away. Log in / Sign out always stays.</p>}
    >
      {error && <div className="err-banner mono">{error}</div>}
      {!options ? <div className="ab-empty mono">Loading…</div> : (
        <div className="cm-list">
          {ITEMS.map((it, i) => {
            const on = read(options, it.key)
            return (
              <div className={`mm-row ${on ? '' : 'off'}`} key={it.key}>
                <span className="cm-pos mono">{i + 1}</span>
                <span className="cm-name mono">{it.label}</span>
                <span className="mm-link mono dim">{it.where}</span>
                <span className="cm-tools">
                  <button type="button" className={`ab-switch mono ${on ? 'on' : ''}`} onClick={() => toggle(it.key)} disabled={busy}>
                    {on ? 'Showing' : 'Hidden'}
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </AdminBox>
  )
}
