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
// One step of the guide, ticked once the panel can tell it's done.
function Step({ n, title, done, children }) {
  return (
    <section className={`bot-step ${done ? 'done' : ''}`}>
      <div className="bot-step-head">
        <span className="bot-num mono">{done ? '✓' : n}</span>
        <b>{title}</b>
      </div>
      <div className="bot-step-body">{children}</div>
    </section>
  )
}

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

      <div className="bot-guide">
        <div className="bot-guide-head mono">SETUP GUIDE — DO THESE IN ORDER</div>

        <Step n={1} title="Make the check in Cloudflare" done={Boolean(saved?.site_key)}>
          <ol>
            <li>Go to <b>dash.cloudflare.com</b> and log in (the same account the shop runs on).</li>
            <li>In the left menu, open <b>Turnstile</b> (under "Application security" or "Protect &amp; Connect" — or type "Turnstile" in the search box at the top).</li>
            <li>Click <b>Add widget</b> (or "Add site").</li>
            <li><b>Widget name:</b> <code>SUNDAY</code>.</li>
            <li><b>Hostnames:</b> add <code>sunday.mish-nayeem.workers.dev</code>. When the shop gets its own domain, come back and add that too (Edit → Hostnames).</li>
            <li><b>Widget mode:</b> <b>Managed</b> — invisible for most people, a tick box only when Cloudflare isn't sure.</li>
            <li>"Pre-clearance": leave it <b>No</b>. Click <b>Create</b>.</li>
            <li>Cloudflare now shows two keys: a <b>Site key</b> (starts with <code>0x4AAA…</code>) and a <b>Secret key</b>. Keep this page open for the next two steps. You can always see them again under Turnstile → SUNDAY → Settings.</li>
          </ol>
        </Step>

        <Step n={2} title="Put the Site key here" done={Boolean(saved?.site_key)}>
          <ol>
            <li>Copy the <b>Site key</b> from Cloudflare.</li>
            <li>Paste it in <b>SITE KEY</b> at the top of this box → <b>Save key</b>.</li>
            <li>The box's corner now says <b>Showing only</b>: the check runs on login, checkout and the portal, but nothing is refused yet.</li>
          </ol>
          <p className="bot-note">The Site key isn't secret — anyone can see it in the page. It's fine to paste here.</p>
        </Step>

        <Step n={3} title="Put the Secret key in Supabase" done={secret === 'ok'}>
          <ol>
            <li>Copy the <b>Secret key</b> from Cloudflare.</li>
            <li>Go to <b>supabase.com/dashboard</b> → the SUNDAY project → <b>Edge Functions</b> (left menu) → <b>Secrets</b>.</li>
            <li><b>Add new secret</b> → Name: <code>TURNSTILE_SECRET</code> → Value: the Secret key → <b>Save</b>.</li>
            <li>Come back here and reload: <b>Secret key in Supabase</b> above should say <b>set ✓</b>.</li>
          </ol>
          <p className="bot-warn">The Secret key is secret. Never paste it in a chat, an email or on this page — only in Supabase.</p>
        </Step>

        <Step n={4} title="Turn it on for login (Supabase)">
          <ol>
            <li>Only after step 2 — otherwise nobody can log in.</li>
            <li>Supabase → the SUNDAY project → <b>Authentication</b> → <b>Attack Protection</b>.</li>
            <li>Turn on <b>Enable CAPTCHA protection</b> → provider <b>Cloudflare Turnstile</b>.</li>
            <li><b>Captcha secret:</b> the same <b>Secret key</b> from Cloudflare → <b>Save</b>.</li>
          </ol>
          <p className="bot-note">From now on, a login code is only sent when the check passes.</p>
        </Step>

        <Step n={5} title="Test it">
          <ol>
            <li>Open the shop in a <b>private / incognito</b> window (so you're not logged in as the admin).</li>
            <li><b>Login:</b> /login → your email → Log in. The code should arrive as usual.</li>
            <li><b>Checkout:</b> add something to the bag → checkout → place a test order with your own number. It should go through. Then cancel it in Orders.</li>
            <li><b>Portal:</b> Support → Returns &amp; exchanges → find that order with its number and your phone.</li>
            <li>If a tick box appears, tick it — that's Cloudflare not being sure, normal now and then.</li>
          </ol>
        </Step>

        <Step n={6} title="Require the check" done={Boolean(saved?.enforce)}>
          <ol>
            <li>Steps 1–5 fine → click <b>Not required</b> above so it says <b>Required</b>.</li>
            <li>Now a script that skips the check can't place an order, get a login code or look up an order. Those tries show in <b>Turned away</b> below as <b>BOT CHECK</b>.</li>
          </ol>
        </Step>

        <details className="bot-more">
          <summary className="mono">SOMETHING WRONG? / HOW TO TURN IT OFF</summary>
          <ul>
            <li><b>Customers say they can't order or log in:</b> click <b>Required</b> to switch back to Not required — orders go through at once. If login is the problem, turn off CAPTCHA in Supabase (step 4) too.</li>
            <li><b>Turn it off completely:</b> empty the SITE KEY box → Save key, and turn off CAPTCHA in Supabase. Everything works as before the check.</li>
            <li><b>"Secret key in Supabase: not set"</b> after step 3: check the name is exactly <code>TURNSTILE_SECRET</code> (capitals, underscore), then reload this page.</li>
            <li><b>"function not deployed yet":</b> the turnstile-check function goes out with this update; wait a few minutes after it's merged and reload.</li>
            <li><b>New domain:</b> add it under Hostnames in Cloudflare (step 1), or the check fails on the new address.</li>
          </ul>
        </details>
      </div>
    </AdminBox>
  )
}
