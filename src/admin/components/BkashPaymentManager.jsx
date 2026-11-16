import { useEffect, useRef, useState } from 'react'
import AdminBox from './AdminBox.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { uploadImage } from '../lib/images.js'
import { useBkashNumber } from '../lib/shopNumbers.js'
import { fetchBkashPay, saveBkashPay } from '../lib/bkashPay.js'

// Admin → Website → bKash payment: the QR shown at checkout beside the
// bKash number, for the outside-Dhaka advance and pay-in-full orders.
// As on PAUSE.
export default function BkashPaymentManager() {
  const [qr, setQr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const fileRef = useRef(null)
  const BKASH_NUMBER = useBkashNumber()

  useEffect(() => { fetchBkashPay().then((p) => setQr(p.qr)) }, [])

  async function store(next, done) {
    const { error } = await saveBkashPay({ qr: next })
    if (error) return setNote(`Couldn't save: ${error.message}`)
    setQr(next)
    setNote(done)
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setNote('')
    try {
      const url = await uploadImage(file, supabase, 'payment')
      await store(url, 'Saved — the checkout shows this QR now.')
    } catch (err) {
      setNote(`Couldn't upload: ${err.message}`)
    }
    setBusy(false)
  }

  async function remove() {
    if (!window.confirm('Take the QR off the checkout? The number stays.')) return
    setBusy(true)
    await store('', 'Removed — the checkout shows the number only.')
    setBusy(false)
  }

  if (qr === null) return <div className="ab-empty mono">Loading…</div>

  return (
    <AdminBox
      wide
      title="BKASH PAYMENT QR"
      tip={
        <>
          <p>The QR from your bKash account for <b>{BKASH_NUMBER}</b>. The checkout shows it beside the number whenever bKash is paid: the outside-Dhaka advance, or an order paid in full.</p>
          <p>Use the QR image from the bKash app (My QR) or the one bKash gave you, cropped to just the code. A clear, square picture scans best.</p>
        </>
      }
    >
      <p className="mono" style={{ fontSize: 12, marginTop: 0 }}>bKash number: <b>{BKASH_NUMBER}</b> <span style={{ opacity: 0.7 }}>— change it in Website → Settings</span></p>
      {qr ? (
        <img src={qr} alt="bKash payment QR" style={{ width: 200, height: 200, objectFit: 'contain', background: '#fff', borderRadius: 10, border: '1px solid #ddd', display: 'block' }} />
      ) : (
        <div className="ab-empty mono">No QR yet — the checkout shows the number only.</div>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="ab-btn mono" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Saving…' : qr ? 'Replace QR' : 'Upload QR'}
        </button>
        {qr && <button type="button" className="ab-btn ghost mono" disabled={busy} onClick={remove}>Remove</button>}
        {note && <span className="mono" style={{ fontSize: 12 }}>{note}</span>}
      </div>
    </AdminBox>
  )
}
