import { useEffect, useState } from 'react'
import AdminBox from './AdminBox.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { fetchSetting, saveSetting } from '../lib/siteSettings.js'

// Orders → Security → Bot check. Cloudflare Turnstile on login, checkout
// and the support portal (src/lib/botCheck.js; the database side is
// migration 20261109120000_turnstile_bot_check.sql). The site key is public
// and saved here; the secret key lives only in Supabase. Showing the check
// and requiring it are separate switches, so it can run for a while before
// orders depend on it.
export default function BotCheckSetup() {
  const [siteKey, setSiteKey] = useState('')
  const [saved, setSaved] = useState(null)
  const [secret, setSecret] = useState('wait')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    fetchSetting('turnstile').then(({ value }) => {
      setSaved({ site_key: value?.site_key || '', enforce: Boolean(value?.enforce) })
      setSiteKey(value?.site_key || '')
    })
    supabase.functions.invoke('turnstile-check', { body: { probe: true } })
      .then(({ data, error }) => setSecret(error ? 'nofn' : data?.configured ? 'ok' : 'missing'))
      .catch(() => setSecret('nofn'))
  }, [])

  async function save(next) {
    setBusy(true)
    const { error } = await saveSetting('turnstile', next)
    setBusy(false)
    if (error) return setNote("Couldn't save — try again.")
    setSaved(next)
    setNote(
      !next.site_key ? 'Off — no check anywhere.'
        : next.enforce ? 'On — login, checkout and the support portal need the check to pass.'
          : 'Showing the check, not requiring it yet.'
    )
  }

  const key = siteKey.trim()
  const ready = Boolean(saved?.site_key) && secret === 'ok'
  const state = !saved ? '' : !saved.site_key ? 'Off' : saved.enforce ? 'Required' : 'Showing only'

  return (
    <AdminBox
      wide
      title="BOT CHECK (CLOUDFLARE TURNSTILE)"
      side={state}
      tip={
        <>
          <p>Cloudflare's "not a robot" check on login, checkout and the Returns &amp; exchanges portal. Usually invisible: it only shows a tick box when it isn't sure. Stops scripts placing fake orders, spamming login codes or guessing order numbers.</p>
          <p><b>Showing only</b>: the check runs, nothing is refused — a safe way to try it. <b>Required</b>: without a passed check, the order, code or lookup is refused.</p>
        </>
      }
    >
      <div className="bot-row">
        <label className="bot-field">
          <span className="ab-label">SITE KEY</span>
          <input className="ab-input mono" placeholder="0x4AAAAAAA…" value={siteKey} onChange={(e) => { setSiteKey(e.target.value); setNote('') }} />
        </label>
        <button type="button" className="ab-btn" disabled={busy || key === (saved?.site_key || '')} onClick={() => save({ site_key: key, enforce: key ? Boolean(saved?.enforce) : false })}>
          Save key
        </button>
      </div>

      <div className="bot-status mono">
        <span>Secret key in Supabase: <b className={secret === 'ok' ? 'ok' : 'bad'}>{secret === 'wait' ? 'checking…' : secret === 'ok' ? 'set ✓' : secret === 'missing' ? 'not set' : 'function not deployed yet'}</b></span>
      </div>

      <div className="bot-switch">
        <span className="ab-label">REQUIRE THE CHECK</span>
        <button
          type="button"
          className={`ab-switch mono ${saved?.enforce ? 'on' : ''}`}
          disabled={busy || !ready}
          onClick={() => save({ site_key: saved.site_key, enforce: !saved.enforce })}
          title={ready ? '' : 'Save the site key and set the secret key first'}
        >
          {saved?.enforce ? 'Required' : 'Not required'}
        </button>
      </div>
      {note && <div className="ab-note mono">{note}</div>}

      <ol className="bot-steps">
        <li><b>Cloudflare</b> → Turnstile → <b>Add widget</b> → name "SUNDAY", hostname <code>sunday.mish-nayeem.workers.dev</code> (and your own domain later) → mode <b>Managed</b> → Create. It shows a <b>Site key</b> and a <b>Secret key</b>.</li>
        <li><b>Site key</b> → paste above → Save key. The check starts showing (invisible for most people).</li>
        <li><b>Secret key</b> → Supabase → Edge Functions → Secrets → <code>TURNSTILE_SECRET</code>. Never paste it in a chat or on this page.</li>
        <li><b>Login too:</b> Supabase → Authentication → Attack Protection → <b>Enable CAPTCHA protection</b> → provider Turnstile → the same <b>Secret key</b> → Save. Only after step 2 — otherwise login stops working.</li>
        <li>Place a test order and send yourself a login code. Both fine → switch <b>Require the check</b> on.</li>
      </ol>
    </AdminBox>
  )
}
