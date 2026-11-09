import { useEffect, useState } from 'react'
import AdminBox from './AdminBox.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { fetchSetting, saveSetting } from '../lib/siteSettings.js'
import UnusedPhotos from './UnusedPhotos.jsx'
import './usage-box.css'

// Overview → how full SUNDAY's Supabase is against its plan, so a limit
// shows up here before Supabase warns (Pause went over its cached egress
// once without anyone noticing in time).
//
// Database and Storage are measured in the database (admin_usage(),
// migration 20261109150000_admin_usage.sql). Egress isn't shared by Supabase
// outside its own dashboard, so that row links there. The plan is picked
// once here (site_settings 'supabase_plan'); buying Pro means switching it.

export const PLANS = {
  free: { label: 'Free', db: 500 * 1024 ** 2, storage: 1024 ** 3, egress: '5 GB' },
  pro: { label: 'Pro', db: 8 * 1024 ** 3, storage: 100 * 1024 ** 3, egress: '250 GB' },
}

const WARN_AT = 0.8

function size(bytes) {
  const b = Number(bytes) || 0
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${Math.round(b / 1024)} KB`
}

const projectRef = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/^https?:\/\//, '').split('.')[0]
const DASHBOARD = projectRef ? `https://supabase.com/dashboard/project/${projectRef}` : 'https://supabase.com/dashboard'

// One read per panel load, shared by the box and the warning above the tabs.
let cache = null
export function loadUsage() {
  if (!cache) {
    cache = Promise.all([
      supabase.rpc('admin_usage'),
      fetchSetting('supabase_plan'),
    ]).then(([{ data, error }, { value }]) => ({
      usage: error ? null : data,
      error: error ? (/admin_usage/.test(error.message || '') ? 'missing' : 'failed') : null,
      plan: PLANS[value?.plan] ? value.plan : 'free',
    }))
  }
  return cache
}

function shares(usage, plan) {
  const p = PLANS[plan]
  return {
    db: usage ? Number(usage.db_bytes) / p.db : 0,
    storage: usage ? Number(usage.storage_bytes) / p.storage : 0,
  }
}

const tone = (f) => (f >= 0.9 ? 'bad' : f >= 0.7 ? 'warn' : 'ok')

function Bar({ label, used, of, f }) {
  return (
    <div className="ub-row">
      <div className="ub-line">
        <span>{label}</span>
        <span className="mono">{used} / {of} · <b className={tone(f)}>{Math.round(f * 100)}%</b></span>
      </div>
      <div className="ub-bar" aria-hidden="true"><i className={tone(f)} style={{ width: `${Math.min(100, f * 100)}%` }} /></div>
    </div>
  )
}

export default function UsageBox() {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { loadUsage().then(setState) }, [])

  async function pick(plan) {
    setBusy(true)
    const { error } = await saveSetting('supabase_plan', { plan })
    setBusy(false)
    if (!error) {
      cache = null
      setState((s) => ({ ...s, plan }))
    }
  }

  if (!state) return null
  const p = PLANS[state.plan]
  const f = shares(state.usage, state.plan)

  return (
    <AdminBox
      wide
      title={`SUPABASE · ${p.label.toUpperCase()} PLAN`}
      side={
        <span className="ub-plan mono" role="radiogroup" aria-label="Supabase plan">
          {Object.entries(PLANS).map(([k, v]) => (
            <button key={k} type="button" role="radio" aria-checked={state.plan === k} className={state.plan === k ? 'on' : ''} disabled={busy} onClick={() => state.plan !== k && pick(k)}>
              {v.label}
            </button>
          ))}
        </span>
      }
      tip={
        <>
          <p>How full SUNDAY's Supabase is against its plan. Green under 70%, amber 70–90%, red over 90%. Over 80% also shows a warning at the top of Overview.</p>
          <p><b>Database</b>: orders, products, visits… <b>Storage</b>: photos, banners and videos you upload.</p>
          <p><b>Egress</b> (data sent out, photos included) Supabase only shows in its own dashboard — check it there once a month. Photos go through Cloudflare, which keeps it low.</p>
          <p><b>Unused photos</b>: files no product, slide, look, setting or order uses any more (old uploads, deleted products). Deleting a product, slide or look now removes its photos too, unless something else still uses them.</p>
          <p>Bought Pro? Switch the plan here to <b>Pro</b> and the limits change.</p>
        </>
      }
    >
      {state.error === 'missing' ? (
        <div className="ab-empty mono">Waiting for the database update (admin_usage) — it goes out with this change.</div>
      ) : !state.usage ? (
        <div className="ab-empty mono">Couldn't read the sizes right now.</div>
      ) : (
        <>
          <Bar label="Database" used={size(state.usage.db_bytes)} of={size(p.db)} f={f.db} />
          <Bar label="Storage (photos, videos)" used={size(state.usage.storage_bytes)} of={size(p.storage)} f={f.storage} />
          <div className="ub-row">
            <div className="ub-line">
              <span>Egress (data sent out)</span>
              <span className="mono">{p.egress} a month · <a href={DASHBOARD} target="_blank" rel="noreferrer">see in Supabase ↗</a></span>
            </div>
            <div className="ub-note mono">Supabase → the organization → Usage → Egress and Cached Egress. Under ~{state.plan === 'pro' ? '8 GB' : '0.15 GB'} a day stays inside the plan.</div>
          </div>

          <div className="ub-detail mono">
            <div>
              <span className="ub-k">BIGGEST TABLES</span>
              {(state.usage.tables || []).map((t) => <span key={t.table}>{t.table} · {size(t.bytes)}</span>)}
            </div>
            <div>
              <span className="ub-k">STORAGE BY FOLDER</span>
              {(state.usage.buckets || []).length === 0 ? <span>—</span> : state.usage.buckets.map((b) => <span key={b.bucket}>{b.bucket} · {b.files} files · {size(b.bytes)}</span>)}
            </div>
          </div>

          <UnusedPhotos onDeleted={() => { cache = null; loadUsage().then(setState) }} />
        </>
      )}
    </AdminBox>
  )
}

// A line over Overview's tabs when the database or storage is 80% full.
export function UsageWarning({ onOpen }) {
  const [state, setState] = useState(null)
  useEffect(() => { loadUsage().then(setState) }, [])
  if (!state?.usage) return null
  const f = shares(state.usage, state.plan)
  const over = [['Database', f.db], ['Storage', f.storage]].filter(([, v]) => v >= WARN_AT)
  if (!over.length) return null
  return (
    <button type="button" className="ub-warn mono" onClick={onOpen}>
      ⚠ {over.map(([k, v]) => `${k} ${Math.round(v * 100)}% full`).join(' · ')} on the {PLANS[state.plan].label} plan — see Today → Supabase
    </button>
  )
}
