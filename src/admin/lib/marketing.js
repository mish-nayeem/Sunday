import { supabase } from './supabaseClient.js'

// The admin's side of the `marketing` edge function (Meta ad spend and
// followers, Brevo campaigns). The keys live in Supabase Secrets; nothing
// here holds one.

// What came back, said plainly — the function's own { error } is read even
// when supabase-js only reports "non-2xx".
async function readError(error, data) {
  let body = data
  if (!body?.error && error?.context?.json) {
    try { body = await error.context.clone().json() } catch { /* not JSON */ }
  }
  const raw = body?.error || error?.message || ''
  if (!raw) return null
  if (/Failed to send a request|NOT_FOUND|404/.test(raw)) return 'The marketing function isn’t deployed yet — push to main so the GitHub Action deploys it.'
  if (raw.startsWith('NOT_CONFIGURED:brevo')) return 'Brevo isn’t set up — add BREVO_API_KEY and BREVO_FROM_EMAIL in Edge Functions → Secrets.'
  if (raw.startsWith('NOT_CONFIGURED:meta')) return 'Meta isn’t set up — add META_ACCESS_TOKEN (and the ids) in Edge Functions → Secrets.'
  if (raw.startsWith('SAID:')) return raw.slice(5).trim()
  if (raw.startsWith('DB:')) return `Database: ${raw.slice(3)} — has the marketing migration (20261025000000_marketing_auto.sql) gone out?`
  if (raw === 'Not allowed') return 'Only the admin account can do this.'
  return raw
}

export async function callMarketing(body) {
  try {
    const { data, error } = await supabase.functions.invoke('marketing', { body })
    const message = await readError(error, data)
    return message ? { data: null, error: message } : { data, error: null }
  } catch (err) {
    return { data: null, error: await readError({ message: err.message }) }
  }
}

// Meta ad spend for a date range ('YYYY-MM-DD', inclusive).
export async function fetchMetaAdDaily(fromDay, toDay) {
  const { data, error } = await supabase
    .from('meta_ad_daily')
    .select('*')
    .gte('day', fromDay)
    .lte('day', toDay)
  if (error) return { rows: [], error: /meta_ad_daily/.test(error.message || '') ? 'The marketing migration (20261025000000_marketing_auto.sql) hasn’t gone out yet.' : error.message }
  return { rows: data, error: null }
}

// Every follower snapshot and typed row, oldest first.
export async function fetchSocialStats() {
  const { data, error } = await supabase.from('social_stats').select('*').order('created_at', { ascending: true })
  if (error) return { rows: [], error: error.message }
  return { rows: data, error: null }
}

export async function fetchEmailCampaigns() {
  const { data, error } = await supabase.from('email_campaigns').select('*').order('created_at', { ascending: false })
  if (error) return { rows: [], error: error.message }
  return { rows: data, error: null }
}

export async function fetchSubscribers() {
  const { data, error } = await supabase.from('newsletter_subscribers').select('email, created_at')
  if (error) return { rows: [], error: error.message }
  return { rows: data, error: null }
}
