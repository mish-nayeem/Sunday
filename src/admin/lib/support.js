import { DELIVERY } from '@/lib/catalog'
import { supabase } from './supabaseClient.js'
import { fetchSetting, saveSetting } from './siteSettings.js'
import { INFO_PAGES, SUPPORT_TABS } from '../content/info-pages.js'

// The Support page: its copy (built-in defaults from src/content/info-pages.js,
// overridden page by page from Admin → Support → Support pages) and the
// Return & Exchange Portal's two calls (supabase-migration-support.sql).

export const PAGES_KEY = 'support_pages'
export const PORTAL_KEY = 'support_portal'
export const TABS_KEY = 'support_tabs'

// The tab row: [{ slug, label, on }] in order — the admin's (Admin →
// Support → Support pages), or the built-in one. `on: false` keeps a tab
// (and its copy) but takes it off the row. A built-in tab the saved row
// doesn't know yet (added to the site later) joins at the end.
export async function fetchSupportTabs() {
  const { value, error } = await fetchSetting(TABS_KEY)
  const list = Array.isArray(value) ? value.filter((t) => t && t.slug && t.label) : null
  if (!list || !list.length) return { tabs: SUPPORT_TABS.map((t) => ({ ...t, on: true })), error }
  const have = new Set(list.map((t) => t.slug))
  return { tabs: [...list, ...SUPPORT_TABS.filter((t) => !have.has(t.slug)).map((t) => ({ ...t, on: true }))], error }
}

export async function saveSupportTabs(tabs) {
  return saveSetting(TABS_KEY, tabs)
}

export const DEFAULT_PORTAL = {
  heading: 'Return & Exchange',
  intro: 'Track your order by entering the order number and the email or phone number you ordered with.',
  image: '',
}

// Saved pages replace their default whole; a page never saved (or saved
// without any content) keeps the built-in copy.
export function mergePages(saved) {
  const out = { ...INFO_PAGES }
  if (saved && typeof saved === 'object') {
    for (const [slug, page] of Object.entries(saved)) {
      if (page && Array.isArray(page.blocks)) out[slug] = { ...INFO_PAGES[slug], ...page }
    }
  }
  return out
}

export async function fetchSupportPages() {
  const { value, error } = await fetchSetting(PAGES_KEY)
  return { pages: mergePages(value), saved: value && typeof value === 'object' ? value : {}, error }
}

export async function saveSupportPages(saved) {
  return saveSetting(PAGES_KEY, saved)
}

export async function fetchPortal() {
  const { value, error } = await fetchSetting(PORTAL_KEY)
  return { portal: { ...DEFAULT_PORTAL, ...(value && typeof value === 'object' ? value : {}) }, error }
}

export async function savePortal(portal) {
  return saveSetting(PORTAL_KEY, portal)
}

// ---------- Portal ----------

// `pass`: the bot check's pass (src/lib/botCheck.js) once that's set up —
// then the checked versions are asked, which the database requires while the
// check is on. undefined = the plain ones, as before.
async function rpcChecked(name, params, pass) {
  if (pass === undefined) return supabase.rpc(name, params)
  const res = await supabase.rpc(`${name}_checked`, { p_turnstile: pass || '', ...params })
  // The database not updated yet: the plain way.
  return res.error?.code === 'PGRST202' ? supabase.rpc(name, params) : res
}

export async function findOrder(orderId, contact, pass) {
  const { data, error } = await rpcChecked('support_find_order', {
    p_order_id: orderId,
    p_contact: contact,
  }, pass)
  if (error) {
    console.error('[Supabase] support_find_order failed:', error.message)
    return { order: null, error: 'Something went wrong. Please try again.' }
  }
  if (!data) return { order: null, error: "We couldn't find an order with those details." }
  // Too many wrong tries from this connection, or a blocked number.
  if (data.error === 'BOT_CHECK') return { order: null, error: 'We couldn’t confirm you’re not a robot. Wait a moment (or tick the box if one shows) and try again.' }
  if (data.error) return { order: null, error: 'Too many tries. Please wait an hour, or message us on WhatsApp.' }
  return { order: data, error: null }
}

// `refundTo`: the bKash number money goes back to (a refund, or a cheaper
// exchange's difference).
export async function sendRequest({ orderId, contact, kind, reason, items, details, refundTo = '', pass }) {
  const { data, error } = await rpcChecked('support_request_return', {
    p_order_id: orderId,
    p_contact: contact,
    p_kind: kind,
    p_reason: reason,
    p_items: items,
    p_details: details,
    ...(refundTo ? { p_refund_to: refundTo } : {}),
  }, pass)
  // The function's own messages ("Pick at least one item.") are written for
  // the customer, so they're shown as they are.
  if (error) return { id: null, error: error.message || 'Something went wrong. Please try again.' }
  if (data?.error) return { id: null, error: data.error }
  return { id: data?.id ?? null, error: null }
}

// ---------- Admin ----------

// An exchange's money, from what was asked (or done): the price difference
// over the pieces (+ the customer owes it, − we owe it back).
export function exchangeDiff(items) {
  return (items || []).reduce((sum, it) => {
    const to = it.to_price ?? it.exchange_price
    const from = it.from_price ?? it.price
    if (to == null || from == null) return sum
    return sum + (Number(to) - Number(from)) * (Number(it.qty) || 1)
  }, 0)
}

// The refund of a cheaper exchange has been sent by bKash.
export async function markExchangeRefund(returnId, trx) {
  const { data, error } = await supabase.rpc('admin_mark_exchange_refund', { p_return_id: returnId, p_trx: trx || '' })
  if (error) console.error('[Supabase] admin_mark_exchange_refund failed:', error.message)
  return { resolution: data, error }
}

// The admin's own email to an order's customer (send-customer-email).
export async function emailCustomer(orderId, subject, text) {
  try {
    const { data, error } = await supabase.functions.invoke('send-customer-email', { body: { orderId, subject, text } })
    if (error) {
      let msg = error.message
      try { msg = (await error.context.clone().json()).error || msg } catch { /* not JSON */ }
      return { error: msg }
    }
    return { error: data?.error || null, to: data?.to }
  } catch (err) {
    return { error: err.message }
  }
}


export function isNewRequest(r) {
  return r.source === 'customer' && !r.seen_at
}

export async function markRequestsSeen(ids) {
  if (!ids.length) return { error: null }
  const { error } = await supabase
    .from('order_returns')
    .update({ seen_at: new Date().toISOString() })
    .in('id', ids)
  if (error) console.error('[Supabase] markRequestsSeen failed:', error.message)
  return { error }
}

export async function updateRequest(id, status, adminNote) {
  const done = status === 'resolved' || status === 'rejected'
  const { error } = await supabase
    .from('order_returns')
    .update({
      status,
      admin_note: adminNote || null,
      resolved_at: done ? new Date().toISOString() : null,
      seen_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) console.error('[Supabase] updateRequest failed:', error.message)
  return { error }
}

// An exchange's second parcel: its delivery charge, by zone. The courier
// keeps it. Only "Wrong size ordered" — the customer's own pick — is theirs
// to pay; every other reason is our mistake, so the shop carries the charge
// and it comes off revenue.
export const EXCHANGE_FEE = { inside: DELIVERY.insideDhaka, outside: DELIVERY.outsideDhaka }

export const EXCHANGE_REASONS = [
  'Wrong size ordered',
  'Wrong size received',
  'Wrong item received',
  'Faulty or damaged product received',
]

// Reasons the customer pays the delivery for — including the wording older
// requests were sent with.
const CUSTOMER_PAYS = ['Wrong size ordered', 'Wrong size', 'Other']

export function exchangeIsFree(reason) {
  return !CUSTOMER_PAYS.includes(reason)
}

// Refunds are only for our mistakes — a faulty piece, the wrong item, or a
// wrong size we sent when the right size is out of stock (otherwise it's
// exchanged). A size the customer ordered wrong is exchanged, never
// refunded. The first delivery stays the customer's; the pickup parcel is
// ours. The money goes back by bKash to the number they give.
export const REFUND_REASONS = ['Wrong size received', 'Wrong item received', 'Faulty or damaged product received']
export const REFUND_WRONG_SIZE = 'Wrong size received'
