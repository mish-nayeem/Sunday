import { supabase } from './supabaseClient.js'
import { bdPhone } from '../../lib/phone.js'
import { fetchSetting, saveSetting } from './siteSettings.js'

// Orders → Security: the block list (phone numbers and internet connections
// that can't order) and the "advance for risky numbers" switch. Checkout's
// create_order reads both (migration 20261026000100_order_safety.sql).

export const SAFETY_KEY = 'order_safety'

export async function fetchBlockList() {
  const { data, error } = await supabase.from('blocked_customers').select('*').order('created_at', { ascending: false })
  if (error) {
    console.error('[Supabase] fetchBlockList failed:', error.message)
    return { rows: [], error: /blocked_customers/.test(error.message || '') ? 'The block list isn’t set up yet — push to main so migration 20261026000100_order_safety.sql goes out.' : "Couldn't load the block list." }
  }
  return { rows: data, error: null }
}

// kind 'phone' (any way it's written; saved as 01XXXXXXXXX) or 'ip'.
export async function blockCustomer(kind, raw, reason) {
  const value = kind === 'phone' ? bdPhone(raw) : String(raw || '').trim()
  if (!value) return { row: null, error: kind === 'phone' ? 'That isn’t a Bangladeshi mobile number.' : 'Type the IP address.' }
  const { data, error } = await supabase
    .from('blocked_customers')
    .upsert({ kind, value, reason: String(reason || '').trim() || null }, { onConflict: 'kind,value' })
    .select()
    .single()
  if (error) {
    console.error('[Supabase] blockCustomer failed:', error.message)
    return { row: null, error: "Couldn't block — try again." }
  }
  return { row: data, error: null }
}

export async function unblockCustomer(id) {
  const { error } = await supabase.from('blocked_customers').delete().eq('id', id)
  if (error) console.error('[Supabase] unblockCustomer failed:', error.message)
  return { error: error ? "Couldn't unblock — try again." : null }
}

// { risky_advance } — on unless the admin turned it off.
export async function fetchSafety() {
  const { value } = await fetchSetting(SAFETY_KEY)
  return { risky_advance: value?.risky_advance !== false }
}

export function saveSafety(next) {
  return saveSetting(SAFETY_KEY, next)
}

export const isBlockedPhone = (list, phone) => {
  const p = bdPhone(phone)
  return Boolean(p) && list.some((b) => b.kind === 'phone' && b.value === p)
}
