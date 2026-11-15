import { useEffect, useState } from 'react'
import AdminBox from './AdminBox.jsx'
import { fetchShopNumbers, saveShopNumber } from '../lib/shopNumbers.js'

// Admin → Website → Settings: the shop's numbers. Each is saved on its own;
// the site picks the new one up straight away.
const FIELDS = [
  {
    key: 'whatsapp',
    title: 'WHATSAPP NUMBER',
    placeholder: '01XXXXXXXXX',
    tip: (
      <>
        <p>Where the round <b>WhatsApp button</b> on the site opens a chat, and <b>Confirm on WhatsApp</b> after a customer places an order.</p>
      </>
    ),
  },
  {
    key: 'bkash',
    title: 'BKASH NUMBER (PAYMENT)',
    placeholder: '01XXXXXXXXX',
    tip: (
      <>
        <p>The number the checkout shows under <b>bKash payment</b>, for the outside-Dhaka advance and pay-in-full orders, with its COPY button.</p>
      </>
    ),
  },
]

const SAID = {
  BAD_NUMBER: 'That isn’t a Bangladeshi mobile number — 11 digits, starting 01.',
  READ_FAILED: 'Couldn’t read the saved numbers — nothing saved. Try again.',
  SAVE_FAILED: 'Couldn’t save — try again.',
  NO_SETTINGS_ROW: 'The settings row is missing in the database — nothing saved.',
}

export default function SettingsManager() {
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState({ whatsapp: '', bkash: '' })
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState({})

  useEffect(() => {
    fetchShopNumbers().then(({ numbers }) => {
      setSaved(numbers)
      setDraft(numbers)
    })
  }, [])

  async function save(which) {
    setBusy(which)
    setNote((n) => ({ ...n, [which]: '' }))
    const { numbers, error } = await saveShopNumber(which, draft[which])
    setBusy('')
    if (error) return setNote((n) => ({ ...n, [which]: SAID[error] || SAID.SAVE_FAILED }))
    setSaved(numbers)
    setDraft((d) => ({ ...d, [which]: numbers[which] }))
    setNote((n) => ({ ...n, [which]: 'Saved — live on the site now.' }))
  }

  if (!saved) return <div className="ab-empty mono">Loading…</div>

  return (
    <div className="ab-grid">
      {FIELDS.map((f) => (
        <AdminBox key={f.key} title={f.title} tip={f.tip}>
          <p className="mono" style={{ fontSize: 12, marginTop: 0 }}>Now: <b>{saved[f.key] || 'not set yet'}</b></p>
          <form
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
            onSubmit={(e) => { e.preventDefault(); save(f.key) }}
          >
            <input
              className="ab-input mono"
              inputMode="tel"
              value={draft[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => { setDraft({ ...draft, [f.key]: e.target.value }); setNote((n) => ({ ...n, [f.key]: '' })) }}
              aria-label={f.title}
              style={{ maxWidth: 220 }}
            />
            <button type="submit" className="ab-btn mono" disabled={busy === f.key || draft[f.key] === saved[f.key]}>
              {busy === f.key ? 'Saving…' : 'Save'}
            </button>
          </form>
          {note[f.key] && <p className="mono" style={{ fontSize: 11.5, margin: '8px 0 0' }}>{note[f.key]}</p>}
        </AdminBox>
      ))}
    </div>
  )
}
