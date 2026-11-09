// Edge Function: turnstile-check
//
// The bot check for checkout and the support portal (migration
// 20261109120000_turnstile_bot_check.sql). The page sends the token
// Cloudflare Turnstile gave it; this asks Cloudflare whether it's real and,
// if so, writes a pass (good for 10 minutes, 10 uses) and returns its id.
// The page hands that to create_order_checked / support_*_checked.
//
//   { token }   → { pass } or { ok: false }
//   { probe: true } → { configured } — whether the secret is set (admin)
//
// Needs TURNSTILE_SECRET (Cloudflare → Turnstile → the site → Secret key) in
// Supabase → Edge Functions → Secrets.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const secret = Deno.env.get('TURNSTILE_SECRET') || ''
    if (body.probe) return json({ configured: Boolean(secret) })
    if (!secret) return json({ ok: false, reason: 'TURNSTILE_SECRET not set' })

    const token = typeof body.token === 'string' ? body.token.slice(0, 4096) : ''
    if (!token) return json({ ok: false, reason: 'no token' }, 400)

    const form = new FormData()
    form.append('secret', secret)
    form.append('response', token)
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    if (ip) form.append('remoteip', ip)

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
    const out = await res.json().catch(() => ({}))
    if (!out?.success) return json({ ok: false, reason: 'not verified' })

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await db.from('turnstile_passes').insert({}).select('id').single()
    if (error || !data) {
      console.error('[turnstile-check] pass failed:', error?.message)
      return json({ ok: false, reason: 'pass failed' }, 500)
    }
    return json({ ok: true, pass: data.id })
  } catch (e) {
    console.error('[turnstile-check]', (e as Error).message)
    return json({ ok: false }, 500)
  }
})
