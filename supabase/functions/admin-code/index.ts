// Edge Function: admin-code
//
// Emails the admin a six-digit code before something that can't be undone
// (Orders → Abandoned cart → Clear all). Only the code's SHA-256 is kept, in
// public.admin_action_codes; admin_clear_abandoned_carts checks it
// (migration 20261115120000_admin_codes_clear_delete.sql). A code works for
// its own action, for 10 minutes, once.
//
// Body: { action: 'clear_abandoned' }
// Admin only. The code goes to the admin's own address.
// Secrets: BREVO_API_KEY, BREVO_FROM_EMAIL (or BREVO_SENDER_EMAIL) — the same
// ones the marketing emails use.

import { ADMIN_EMAIL, isAdminRequest, serviceClient } from '../_shared/admin.ts'

const ACTIONS: Record<string, string> = {
  clear_abandoned: 'clear the abandoned carts list (Orders → Abandoned cart → Clear all)',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const db = serviceClient()
    if (!(await isAdminRequest(req, db))) return json({ error: 'Not allowed' }, 403)

    const { action } = await req.json().catch(() => ({}))
    if (!ACTIONS[action]) return json({ error: 'Unknown action' }, 400)

    // At most 5 codes in 15 minutes for one action.
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count } = await db.from('admin_action_codes').select('id', { count: 'exact', head: true }).eq('action', action).gte('created_at', since)
    if ((count ?? 0) >= 5) return json({ error: 'Too many codes asked for — wait a few minutes.' }, 429)

    const apiKey = Deno.env.get('BREVO_API_KEY')
    const fromEmail = Deno.env.get('BREVO_FROM_EMAIL') || Deno.env.get('BREVO_SENDER_EMAIL')
    const fromName = Deno.env.get('BREVO_FROM_NAME') || Deno.env.get('BREVO_SENDER_NAME') || 'SUNDAY'
    if (!apiKey || !fromEmail) return json({ error: 'Email is not set up (BREVO_API_KEY / BREVO_FROM_EMAIL).' }, 500)

    // A new code replaces any still waiting for this action.
    await db.from('admin_action_codes').update({ used_at: new Date().toISOString() }).eq('action', action).is('used_at', null)
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
    const code = String(n).padStart(6, '0')
    const { error } = await db.from('admin_action_codes').insert({
      action,
      code_hash: await sha256(code),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    if (error) throw new Error(error.message)

    const what = ACTIONS[action]
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: ADMIN_EMAIL }],
        subject: `SUNDAY admin code: ${code}`,
        textContent: `Your code to ${what}: ${code}\n\nIt works once, for 10 minutes. If you didn't ask for it, someone is signed in to your admin — sign out everywhere.`,
        htmlContent: `<div style="font-family:Helvetica,Arial,sans-serif;background:#F5F5F5;padding:28px 20px;"><div style="max-width:460px;margin:0 auto;color:#16160F;">
          <div style="font-size:24px;font-weight:bold;">SUNDAY ADMIN</div>
          <p style="font-size:14px;line-height:1.6;margin:20px 0 8px;">Your code to <b>${what}</b>:</p>
          <div style="font-size:34px;letter-spacing:8px;font-weight:bold;margin:6px 0 18px;">${code}</div>
          <p style="font-size:12px;line-height:1.6;color:#55534C;">It works once, for 10 minutes. If you didn't ask for it, someone is signed in to your admin — sign out everywhere.</p>
        </div></div>`,
      }),
    })
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`)

    const [user, domain] = ADMIN_EMAIL.split('@')
    return json({ sent: true, to: `${user.slice(0, 1)}•••@${domain}` })
  } catch (err) {
    console.error('[admin-code]', (err as Error).message)
    return json({ error: "Couldn't send the code. Try again." }, 400)
  }
})
