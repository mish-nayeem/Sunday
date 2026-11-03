import { useState } from 'react'
import AdminBox from './AdminBox.jsx'
import InfoTip from './InfoTip.jsx'
import { checkCouriers } from '../lib/courier.js'
import './courier-setup.css'

// What each courier needs, step by step — shown in its box so the setup can
// be done months from now without asking anyone.
const GUIDE = {
  steadfast: {
    label: 'Steadfast',
    ready: true,
    secrets: ['STEADFAST_API_KEY', 'STEADFAST_SECRET_KEY'],
    steps: [
      'Log in to the Steadfast merchant panel (steadfast.com.bd).',
      'Open API (in the side menu, sometimes under Settings) and copy the API Key and the Secret Key.',
      'Supabase → Edge Functions → Secrets → Add: STEADFAST_API_KEY and STEADFAST_SECRET_KEY with those two values.',
      'Press Check connection below. Green = done.',
    ],
  },
  pathao: {
    label: 'Pathao',
    ready: true,
    secrets: ['PATHAO_CLIENT_ID', 'PATHAO_CLIENT_SECRET', 'PATHAO_USERNAME', 'PATHAO_PASSWORD', 'PATHAO_STORE_ID'],
    steps: [
      'Log in to the Pathao merchant panel (merchant.pathao.com).',
      'Developer API → copy the Client ID and Client Secret.',
      'Stores → note your store’s ID (the number).',
      'Supabase → Edge Functions → Secrets → Add: PATHAO_CLIENT_ID, PATHAO_CLIENT_SECRET, PATHAO_USERNAME (your Pathao login email), PATHAO_PASSWORD (your Pathao password) and PATHAO_STORE_ID.',
      'Press Check connection below. Green = done.',
    ],
  },
  redx: {
    label: 'RedX',
    ready: false,
    secrets: ['REDX_ACCESS_TOKEN'],
    steps: [
      'Not built yet: RedX wants its own area code on every parcel, so it needs an area picker on each order first.',
      'Use Steadfast or Pathao for now — ask for RedX when you need it.',
    ],
  },
}

// What a check answered, as a word and a colour.
function read(result, ready) {
  if (!ready) return { tone: 'off', word: 'Not built yet', detail: '' }
  if (!result) return { tone: 'idle', word: 'Not checked', detail: 'Press Check connection.' }
  if (result.ok) return { tone: 'ok', word: 'Connected', detail: result.message.replace(/^Connected\s*·\s*/, '') }
  const m = result.message || ''
  if (m.startsWith('NOT_CONFIGURED')) return { tone: 'idle', word: 'No keys yet', detail: 'Add the secrets below, then check again.' }
  if (m.startsWith('COURIER_SAID:')) return { tone: 'bad', word: 'Keys refused', detail: m.replace('COURIER_SAID:', '').trim() }
  return { tone: 'bad', word: 'Problem', detail: m }
}

// Orders → Courier setup. Nothing here holds a key: the keys live in
// Supabase Secrets, where only the courier function can read them. This
// page just shows which couriers are switched on and how to switch the rest.
export default function CourierSetup() {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checkedAt, setCheckedAt] = useState(null)

  async function check() {
    setBusy(true)
    setError('')
    const r = await checkCouriers()
    setBusy(false)
    setCheckedAt(new Date())
    if (r.error) {
      setResult(null)
      setError(r.error)
    } else {
      setResult(r.couriers)
    }
  }

  return (
    <div className="cset">
      <div className="cset-head">
        <div>
          <div className="cset-title">Courier booking</div>
          <div className="cset-sub mono">
            Book parcels straight from an order — or many at once with Select. Add one courier’s keys and it starts working; nothing else to change.
          </div>
        </div>
        <InfoTip>
          <p><b>How it works:</b> on an order, pick a courier → Send to courier. The courier gets the name, phone, address and the amount to collect (bKash advance already taken off), and the tracking number comes back onto the order.</p>
          <p><b>Sync status</b> on an order asks the courier where the parcel is now. The website also asks by itself every 30 minutes.</p>
          <p><b>What moves by itself:</b> once the courier has the parcel the order becomes Shipped; when the courier says Delivered the order becomes Delivered and the customer gets a “delivered” email. Cancelled / returned stay with you.</p>
          <p><b>Why keys go in Supabase, not here:</b> a key in the admin page can be read by anyone who opens it. In Supabase Secrets only the courier function sees it.</p>
        </InfoTip>
      </div>

      <div className="cset-check">
        <button type="button" className="ab-btn" disabled={busy} onClick={check}>
          {busy ? 'Checking…' : 'Check connection'}
        </button>
        <span className="mono cset-when">
          {checkedAt ? `Checked ${checkedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Asks each courier whether its keys work.'}
        </span>
      </div>

      {error && <div className="ab-warn mono">{error}</div>}

      <div className="ab-grid">
        {Object.entries(GUIDE).map(([key, g]) => {
          const s = read(result?.[key], g.ready)
          return (
            <AdminBox
              key={key}
              title={g.label.toUpperCase()}
              side={<span className={`cset-pill ${s.tone}`}>{s.word}</span>}
              tip={g.ready
                ? `Secrets needed: ${g.secrets.join(', ')}. Values come from your ${g.label} merchant panel — never paste them anywhere else.`
                : 'Planned for later.'}
            >
              {s.detail && <div className={`cset-detail mono ${s.tone}`}>{s.detail}</div>}
              <ol className="cset-steps">
                {g.steps.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
              {g.ready && (
                <div className="cset-secrets mono">
                  {g.secrets.map((n) => <code key={n}>{n}</code>)}
                </div>
              )}
            </AdminBox>
          )
        })}
      </div>

      <AdminBox title="SETUP, START TO END" wide tip="Do this once, for the courier you use. Nothing on the website itself needs changing.">
        <ol className="cset-steps">
          <li>Open the merchant account with the courier (Steadfast or Pathao) and get API access — the steps are in its box above.</li>
          <li>Go to supabase.com → the SUNDAY project → Edge Functions → Secrets (Manage secrets) → Add new secret.</li>
          <li>Add each secret named in that courier’s box: the name exactly as written (capital letters, underscores), the value from the courier’s panel. Save.</li>
          <li>Come back here and press Check connection. Green “Connected” = done. “Keys refused” = a value is wrong — copy it again.</li>
          <li>Test once: open an order → pick the courier → Send to courier. The tracking number appears on the order, and the parcel shows in the courier’s own panel.</li>
          <li>From then on, the website checks each parcel every 30 minutes; the customer sees every step on Track order.</li>
        </ol>
        <div className="cset-detail mono idle" style={{ marginTop: 10 }}>
          Keys go only into Supabase Secrets — never into this page, a chat, an email or GitHub. Anyone who has them can book parcels in your name.
        </div>
      </AdminBox>

      <div className="ab-note mono">
        After adding or changing a secret, no redeploy is needed — just Check connection again.
      </div>
    </div>
  )
}
