import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { fetchSetting, saveSetting } from './siteSettings.js'
import { DEFAULT_BKASH, localMobile } from '@/lib/shopNumbersRules.js'

// Admin → Website → Settings: the WhatsApp and bKash numbers
// (src/lib/shopNumbersRules.js says where each is used and kept).
const KEY = 'shop_numbers'

export async function fetchShopNumbers() {
  const [{ data: rows, error }, { value }] = await Promise.all([
    supabase.from('settings').select('id, whatsapp_number').limit(1),
    fetchSetting(KEY),
  ])
  const row = rows?.[0] || null
  const wa = localMobile(row?.whatsapp_number)
  return {
    numbers: { whatsapp: wa, bkash: localMobile(value?.bkash) || DEFAULT_BKASH },
    settingsId: row?.id || null,
    error,
  }
}

// Saves one number ('whatsapp' or 'bkash'). Returns { numbers } or { error }.
export async function saveShopNumber(which, raw) {
  const local = localMobile(raw)
  if (!local) return { error: 'BAD_NUMBER' }
  const { numbers, settingsId, error: readError } = await fetchShopNumbers()
  if (readError) return { error: 'READ_FAILED' }
  if (which === 'whatsapp') {
    if (!settingsId) return { error: 'NO_SETTINGS_ROW' }
    const { error } = await supabase.from('settings').update({ whatsapp_number: `88${local}` }).eq('id', settingsId)
    if (error) return { error: 'SAVE_FAILED' }
  } else {
    const { error } = await saveSetting(KEY, { bkash: local })
    if (error) return { error: 'SAVE_FAILED' }
  }
  return { numbers: { ...numbers, [which]: local }, error: null }
}

// The bKash number on the checkout: the default straight away, the saved
// one once read.
export function useBkashNumber() {
  const [bkash, setBkash] = useState(DEFAULT_BKASH)
  useEffect(() => {
    let alive = true
    fetchSetting(KEY).then(({ value }) => {
      const n = localMobile(value?.bkash)
      if (alive && n) setBkash(n)
    }).catch(() => {})
    return () => { alive = false }
  }, [])
  return bkash
}
