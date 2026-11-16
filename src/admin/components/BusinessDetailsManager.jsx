import { useEffect, useState } from 'react'
import AdminBox from './AdminBox.jsx'
import { BUSINESS_FIELDS, fetchBusiness, saveBusiness } from '../lib/business.js'

// Admin → Website → Business details: the shop's legal details. Leave a box
// empty and it simply doesn't show on the site. As on PAUSE.
export default function BusinessDetailsManager() {
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    fetchBusiness().then((d) => { setDraft(d); setSaved(d) })
  }, [])

  if (!draft) return <div className="ab-empty mono">Loading…</div>
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  async function save() {
    setBusy(true)
    const { error } = await saveBusiness(draft)
    setBusy(false)
    if (error) return setNote(`Couldn't save: ${error.message}`)
    setSaved(draft)
    setNote('Saved — it shows on the site now.')
  }

  return (
    <AdminBox
      wide
      title="BUSINESS DETAILS"
      side={<a href="/support/contact" target="_blank" rel="noreferrer">See it on the Contact page ↗</a>}
      tip={
        <>
          <p>Bangladesh's Digital Commerce Operation Guidelines (2021) ask an online shop to show who runs it: a business name, an address, a trade licence and the like.</p>
          <p>Fill in what you have. Each one shows on the <b>Contact</b> pages under "Business details"; the trade licence and DBID also go in the footer's small print. An empty box doesn't show anywhere.</p>
        </>
      }
    >
      {BUSINESS_FIELDS.map((f) => (
        <label key={f.key} style={{ display: 'block' }}>
          <span className="ab-label">{f.label.toUpperCase()}</span>
          {f.long ? (
            <textarea className="ab-input" rows={2} value={draft[f.key]} placeholder={f.placeholder} onChange={(e) => { setDraft({ ...draft, [f.key]: e.target.value }); setNote('') }} />
          ) : (
            <input className="ab-input" value={draft[f.key]} placeholder={f.placeholder} onChange={(e) => { setDraft({ ...draft, [f.key]: e.target.value }); setNote('') }} />
          )}
        </label>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="ab-btn mono" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save business details'}</button>
        {note && <span className="mono" style={{ fontSize: 12 }}>{note}</span>}
      </div>
    </AdminBox>
  )
}
