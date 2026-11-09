import { useEffect, useState } from 'react'
import AdminBox from './AdminBox.jsx'
import { fetchSetting, saveSetting } from '../lib/siteSettings.js'
import { callMarketing } from '../lib/marketing.js'
import { META_PIXEL_KEY } from '@/lib/metaPixel'

// Marketing → Setup guide → Meta Pixel. The Pixel ID (not a secret — it's in
// every page the Pixel runs on) is saved here; the Conversions API token is a
// secret and lives only in Supabase. A test code sends the server's events to
// Events Manager → Test events while setting up.
const EVENTS = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase']

export default function MetaPixelSetup() {
  const [id, setId] = useState('')
  const [test, setTest] = useState('')
  const [saved, setSaved] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [capi, setCapi] = useState('wait')

  useEffect(() => {
    fetchSetting(META_PIXEL_KEY).then(({ value }) => {
      setId(value?.id || '')
      setTest(value?.test_code || '')
      setSaved(value || {})
    })
    callMarketing({ action: 'check' }).then(({ data }) => setCapi(data?.services?.capi?.ok ? 'ok' : 'idle'))
  }, [])

  async function save(e) {
    e.preventDefault()
    const clean = id.replace(/\D/g, '')
    if (id.trim() && (clean.length < 10 || clean.length > 20)) {
      setNote('A Pixel ID is a 15–16 digit number — check it in Events Manager.')
      return
    }
    setBusy(true)
    const value = { id: clean, test_code: test.trim() }
    const { error } = await saveSetting(META_PIXEL_KEY, value)
    setBusy(false)
    if (error) return setNote("Couldn't save — try again.")
    setId(clean)
    setSaved(value)
    setNote(clean ? 'Saved — the Pixel loads on the shop from the next page a shopper opens.' : 'Saved — the Pixel is off.')
  }

  const on = Boolean(saved?.id)
  return (
    <AdminBox
      wide
      title="META PIXEL & CONVERSIONS API"
      side={saved == null ? '' : <span className={`mk-pill ${on ? 'ok' : 'idle'}`}>{on ? 'Pixel on' : 'Pixel off'}</span>}
      tip={
        <>
          <p>Tells Meta what shoppers do on the site, so Ads Manager shows which ads brought sales (ROAS) and Meta can find more people like your buyers and show ads again to people who looked.</p>
          <p>Sent: {EVENTS.join(', ')}. Purchase is sent twice — from the browser and from the server (Conversions API, which ad blockers can't stop) — with the order's id, so Meta counts it once.</p>
          <p>The admin's own pages are never tracked.</p>
        </>
      }
    >
      <form className="mk-pixel" onSubmit={save}>
        <label className="mk-field">
          <span className="ab-label">PIXEL ID</span>
          <input className="ab-input mono" inputMode="numeric" placeholder="e.g. 123456789012345" value={id} onChange={(e) => { setId(e.target.value); setNote('') }} />
        </label>
        <label className="mk-field">
          <span className="ab-label">TEST EVENT CODE (OPTIONAL)</span>
          <input className="ab-input mono" placeholder="TEST12345 — only while testing" value={test} onChange={(e) => { setTest(e.target.value); setNote('') }} />
        </label>
        <button type="submit" className="ab-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
      {note && <div className="mk-note mono">{note}</div>}

      <div className="mk-steps">
        <ol>
          <li><b>Pixel ID:</b> Events Manager (business.facebook.com/events_manager) → Data sources → your Pixel → the number under its name. It's the number in your base code's <code>fbq('init', '…')</code>. Paste it above → Save. You don't need to paste the base code anywhere.</li>
          <li>
            <b>Conversions API token</b> <span className={`mk-pill ${capi === 'ok' ? 'ok' : 'idle'}`}>{capi === 'wait' ? 'Checking…' : capi === 'ok' ? 'Set' : 'Not set'}</span>:
            the Pixel → Settings → Conversions API → <i>Generate access token</i>. Add it in Supabase → Edge Functions → Secrets as <code>META_CAPI_TOKEN</code>. Never paste it in a chat or on this page.
          </li>
          <li><b>Test:</b> the Pixel → Test events → copy the test code → paste it above → Save. Open the shop, view a product, add to bag, place a test order — each event shows up there within a minute. Then clear the test code → Save, or real orders keep landing in Test events.</li>
          <li><b>Domain:</b> once the shop has its own domain, verify it in Business settings → Brand safety → Domains, and choose the Pixel's top events (Aggregated event measurement) with Purchase first.</li>
        </ol>
      </div>
    </AdminBox>
  )
}
