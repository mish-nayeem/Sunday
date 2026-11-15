import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import './code-gate.css'

// Before something that can't be undone (Abandoned cart → Clear all): a
// six-digit code goes to the admin's email (edge function admin-code) and
// the action runs only with it. `onConfirm(code)` does the action and
// returns { error } — the database's CODE_* answers are said plainly here.

const SAID = {
  CODE_NEEDED: 'No code waiting — send a new one.',
  CODE_WRONG: "That code isn't right. Check the email and try again.",
  CODE_LOCKED: 'Too many wrong tries — send a new code.',
}

export function codeMessage(err) {
  const raw = String(err?.message || err || '')
  const key = Object.keys(SAID).find((k) => raw.includes(k))
  if (key) return SAID[key]
  if (/admin_clear_abandoned_carts|admin-code|Failed to send|NOT_FOUND/.test(raw)) return 'Waiting for the update to go out — try again in a few minutes.'
  return raw || 'Something went wrong. Try again.'
}

export default function CodeGate({ action, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  const [sent, setSent] = useState('') // where it went
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  async function send() {
    setBusy('send')
    setNote('')
    const { data, error } = await supabase.functions.invoke('admin-code', { body: { action } })
    setBusy('')
    if (error || data?.error) {
      let msg = data?.error
      if (!msg && error?.context?.json) { try { msg = (await error.context.clone().json())?.error } catch { /* not JSON */ } }
      return setNote(codeMessage(msg || error))
    }
    setSent(data?.to || 'your email')
    setCode('')
  }

  async function confirm(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code.trim())) return setNote('Type the 6 digits from the email.')
    setBusy('confirm')
    setNote('')
    const out = await onConfirm(code.trim())
    setBusy('')
    if (out?.error) setNote(codeMessage(out.error))
  }

  return (
    <div className="cg mono">
      {!sent ? (
        <div className="cg-row">
          <span>We'll email you a code first.</span>
          <button type="button" className="cg-btn" disabled={busy === 'send'} onClick={send}>{busy === 'send' ? 'Sending…' : 'Send code to my email'}</button>
          {onCancel && <button type="button" className="cg-btn ghost" onClick={onCancel}>Cancel</button>}
        </div>
      ) : (
        <form className="cg-row" onSubmit={confirm}>
          <span>Code sent to {sent}.</span>
          <input
            className="cg-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setNote('') }}
            autoFocus
          />
          <button type="submit" className="cg-btn danger" disabled={busy === 'confirm'}>{busy === 'confirm' ? 'Working…' : confirmLabel}</button>
          <button type="button" className="cg-btn ghost" disabled={busy === 'send'} onClick={send}>{busy === 'send' ? 'Sending…' : 'Send again'}</button>
          {onCancel && <button type="button" className="cg-btn ghost" onClick={onCancel}>Cancel</button>}
        </form>
      )}
      {note && <div className="cg-note">{note}</div>}
    </div>
  )
}
