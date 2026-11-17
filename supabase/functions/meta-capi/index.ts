// Edge Function: meta-capi
//
// Meta Conversions API — every Pixel event also goes to Meta from the
// server (audit MEDIUM-9, as on PAUSE), so ad blockers and phone privacy
// settings (which stop the browser's Pixel) don't hide it. The browser
// sends each one with the same event id, so Meta counts it once.
//
// Purchase — called by the checkout with { order_id, url, fbp, fbc }. Only
//   the id is trusted: amount, items and contact details are read back from
//   the database with the service role. A new order only (its first 30
//   minutes), so this can't be used to replay old ones.
// PageView, ViewContent, AddToCart, InitiateCheckout — called by
//   src/lib/metaPixel.js with { event, event_id, url, custom_data, fbp,
//   fbc }. Nothing in them is secret, so they're taken as sent, trimmed to
//   Meta's shape and sizes; only the shop's own pages are accepted.
//
// The email and phone go to Meta SHA-256 hashed, as Meta requires — never in
// plain text.
//
// Needs:
//   META_CAPI_TOKEN  — Events Manager → the Pixel → Settings → Conversions
//                      API → Generate access token (Edge Functions → Secrets)
//   site_settings 'meta_pixel' { id, test_code? } — set in Admin → Marketing
//                      → Setup guide (SUNDAY). With test_code set, events show under
//                      Events Manager → Test events instead of counting.
// With either missing it does nothing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'
import { fetchWithTimeout } from '../_shared/http.ts'
import * as Sentry from 'npm:@sentry/deno@^8'

// Errors reach Sentry when the SENTRY_DSN secret is set (audit MEDIUM-5);
// without it every call is a safe no-op. defaultIntegrations: false — the
// Deno SDK doesn't instrument Deno.serve, so scope from one request can't
// bleed into another if the isolate is reused.
Sentry.init({ dsn: Deno.env.get('SENTRY_DSN'), defaultIntegrations: false })

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 01712345678 / +8801712345678 → 8801712345678 (country code, digits only).
function bdPhone(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('880')) return d
  if (d.startsWith('0')) d = d.slice(1)
  return d ? '880' + d : ''
}

const clip = (v: unknown, n = 500) => String(v ?? '').slice(0, n)

// The events the shop's pages send besides Purchase.
const BROWSER_EVENTS = new Set(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout'])
// The shop's own addresses: sundayclothin.com (and www), and the workers.dev
// address the Worker also answers on (it redirects to the domain).
const SHOP_HOSTS = /^https:\/\/((www\.)?sundayclothin\.com|sunday\.sunday-8e5\.workers\.dev)(\/|$)/

const num = (v: unknown, max: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : undefined
}

// What the page said about the event, in Meta's shape and no bigger.
function browserCustomData(raw: Record<string, unknown> | undefined) {
  const c = raw && typeof raw === 'object' ? raw : {}
  const ids = Array.isArray(c.content_ids) ? c.content_ids.slice(0, 50).map((x) => clip(x, 64)).filter(Boolean) : undefined
  const contents = Array.isArray(c.contents)
    ? c.contents.slice(0, 50).map((x: Record<string, unknown>) => ({
        id: clip(x?.id, 64),
        quantity: Math.round(num(x?.quantity, 1000) ?? 1),
        item_price: num(x?.item_price, 10_000_000) ?? 0,
      })).filter((x) => x.id)
    : undefined
  const out: Record<string, unknown> = {
    currency: 'BDT',
    value: num(c.value, 10_000_000),
    content_type: c.content_type ? 'product' : undefined,
    content_ids: ids?.length ? ids : undefined,
    contents: contents?.length ? contents : undefined,
    content_name: c.content_name ? clip(c.content_name, 200) : undefined,
    content_category: c.content_category ? clip(c.content_category, 100) : undefined,
    num_items: c.num_items != null ? Math.round(num(c.num_items, 1000) ?? 0) : undefined,
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  if (out.value === undefined) delete out.currency
  return out
}

async function sendToMeta(pixel: string, token: string, testCode: string, event: Record<string, unknown>) {
  const version = Deno.env.get('META_API_VERSION') || 'v21.0'
  // Safe to send twice: Meta keeps one copy of an event_id.
  const res = await fetchWithTimeout(`https://graph.facebook.com/${version}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [event], ...(testCode ? { test_event_code: testCode } : {}) }),
  }, { retries: 1 })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('[meta-capi] Meta said:', JSON.stringify(out).slice(0, 500))
    Sentry.captureMessage(`[meta-capi] Meta refused an event: ${JSON.stringify(out?.error?.message ?? out).slice(0, 300)}`, 'warning')
    await Sentry.flush(2000)
    return json({ sent: false }, 502)
  }
  return json({ sent: true, received: out?.events_received ?? null })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const orderId = typeof body.order_id === 'string' ? body.order_id : ''
    const browserEvent = typeof body.event === 'string' && BROWSER_EVENTS.has(body.event) ? body.event : ''
    if (!orderId && !browserEvent) return json({ error: 'order_id or a known event is required' }, 400)

    const token = Deno.env.get('META_CAPI_TOKEN')
    if (!token) return json({ skipped: true, reason: 'META_CAPI_TOKEN not set' })

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: setting } = await db.from('site_settings').select('value').eq('key', 'meta_pixel').maybeSingle()
    const pixel = String(setting?.value?.id || '').replace(/\D/g, '')
    const testCode = String(setting?.value?.test_code || '').trim()
    if (!pixel) return json({ skipped: true, reason: 'no Pixel ID saved' })

    // The real visitor: Supabase's gateway puts their address last.
    const fwd = req.headers.get('x-forwarded-for') || ''
    const ip = fwd.split(',').map((s) => s.trim()).filter(Boolean).pop() || undefined

    // ---- PageView / ViewContent / AddToCart / InitiateCheckout ----
    if (browserEvent) {
      const url = String(body.url || '')
      const eventId = clip(body.event_id, 100)
      // Only the shop's own pages, and each with the id the Pixel used.
      if (!SHOP_HOSTS.test(url) || !eventId) return json({ skipped: true })
      return await sendToMeta(pixel, token, testCode, {
        event_name: browserEvent,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'website',
        event_source_url: clip(url),
        user_data: {
          country: [await sha256('bd')],
          client_ip_address: ip,
          client_user_agent: clip(req.headers.get('user-agent'), 400) || undefined,
          fbp: clip(body.fbp, 200) || undefined,
          fbc: clip(body.fbc, 300) || undefined,
        },
        custom_data: browserCustomData(body.custom_data),
      })
    }

    // ---- Purchase ----
    // SUNDAY: orders are found by their number (SND-…), lines are in items.
    const { data: order } = await db.from('orders').select('*').eq('order_id', orderId).maybeSingle()
    // The same answer whether the order is missing or too old, so this can't
    // be used to find out which ids exist.
    const fresh = order && Date.now() - new Date(order.created_at).getTime() < 30 * 60 * 1000
    if (!fresh) return json({ skipped: true })

    const items = ((Array.isArray(order.items) ? order.items : []) as { product_id?: string; quantity?: number; qty?: number; price?: number }[])
      .map((i) => ({ product_id: i.product_id, qty: Number(i.quantity ?? i.qty) || 1, price: Number(i.price) || 0 }))
    const email = String(order.email || '').trim().toLowerCase()
    const phone = bdPhone(order.mobile)
    const first = String(order.full_name || '').trim().split(/\s+/)[0]?.toLowerCase() || ''
    const city = String(order.district || '').trim().toLowerCase().replace(/[^a-z]/g, '')

    const userData: Record<string, unknown> = {
      country: [await sha256('bd')],
      client_ip_address: ip,
      client_user_agent: clip(req.headers.get('user-agent'), 400) || undefined,
      fbp: clip(body.fbp, 200) || undefined,
      fbc: clip(body.fbc, 300) || undefined,
    }
    if (email) userData.em = [await sha256(email)]
    if (phone) {
      userData.ph = [await sha256(phone)]
      userData.external_id = [await sha256(phone)]
    }
    if (first) userData.fn = [await sha256(first)]
    if (city) userData.ct = [await sha256(city)]

    const value = Number(order.total ?? (Number(order.subtotal) + Number(order.delivery_charge || 0))) || 0
    const event = {
      event_name: 'Purchase',
      event_time: Math.floor(new Date(order.created_at).getTime() / 1000),
      event_id: String(order.order_id),
      action_source: 'website',
      event_source_url: /^https:\/\//.test(String(body.url || '')) ? clip(body.url) : undefined,
      user_data: userData,
      custom_data: {
        currency: 'BDT',
        value,
        content_type: 'product',
        content_ids: items.map((i) => String(i.product_id)).filter(Boolean),
        contents: items.map((i) => ({ id: String(i.product_id), quantity: Number(i.qty) || 1, item_price: Number(i.price) || 0 })),
        num_items: items.reduce((n, i) => n + (Number(i.qty) || 0), 0),
        order_id: String(order.order_id),
      },
    }

    return await sendToMeta(pixel, token, testCode, event)
  } catch (e) {
    Sentry.captureException(e)
    await Sentry.flush(2000)
    console.error('[meta-capi]', (e as Error).message)
    return json({ error: 'failed' }, 500)
  }
})
