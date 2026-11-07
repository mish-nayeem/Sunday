// Edge Function: send-customer-email
//
// An email the admin wrote (or edited) in the panel, sent to the customer of
// one order — Admin → Support → Returns & exchanges → "Email the customer"
// (an exchange accepted: what to pay the rider, or the refund and the bKash
// number it goes to). The admin's own words go out as they are, in the
// SUNDAY letter style.
//
// Body: { orderId, subject, text }   (orderId = the order number, SND-…)
// Secrets: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME (already set).
// Only the admin's own login can send (see _shared/admin.ts).

import { isAdminRequest, serviceClient } from '../_shared/admin.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// The admin's text as the letter: an empty line starts a new paragraph.
function letter(text: string): string {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#141414;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  return `
  <div style="background:#F1F0EE;padding:32px 20px;font-family:Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;padding:28px 26px;">
      <div style="font-size:24px;font-weight:bold;letter-spacing:2px;color:#141414;">SUNDAY</div>
      <div style="margin-top:22px;">${paras}</div>
      <div style="margin-top:28px;padding-top:16px;border-top:1px solid #E4E2DF;font-size:11px;color:#6E6E6E;line-height:1.6;">
        Questions? Reply to this email with your order number.<br>
        SUNDAY · Bangladesh
      </div>
    </div>
  </div>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const db = serviceClient()
    if (!(await isAdminRequest(req, db))) return json({ error: 'Not allowed' }, 403)

    const { orderId, subject, text } = await req.json().catch(() => ({}))
    if (!orderId || !String(subject || '').trim() || !String(text || '').trim()) {
      return json({ error: 'orderId, subject and text are required' }, 400)
    }

    const { data: o, error } = await db.from('orders').select('email, full_name').eq('order_id', orderId).maybeSingle()
    if (error) throw new Error(error.message)
    const email = String(o?.email || '').trim()
    if (!email) return json({ error: 'This order has no email address.' }, 400)

    const apiKey = Deno.env.get('BREVO_API_KEY')
    const fromEmail = Deno.env.get('BREVO_SENDER_EMAIL') || Deno.env.get('BREVO_FROM_EMAIL')
    const fromName = Deno.env.get('BREVO_SENDER_NAME') || Deno.env.get('BREVO_FROM_NAME') || 'SUNDAY'
    if (!apiKey || !fromEmail) return json({ error: 'Email is not set up (BREVO_API_KEY / BREVO_SENDER_EMAIL).' }, 500)

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email, name: o?.full_name || undefined }],
        subject: String(subject).trim().slice(0, 200),
        htmlContent: letter(String(text).slice(0, 8000)),
        textContent: String(text).slice(0, 8000),
      }),
    })
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return json({ ok: true, to: email })
  } catch (err) {
    const message = String((err as Error).message ?? err)
    console.error('[send-customer-email]', message)
    return json({ error: message }, 400)
  }
})
