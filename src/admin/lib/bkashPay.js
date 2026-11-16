import { useEffect, useState } from 'react'
import { fetchSetting, saveSetting } from './siteSettings.js'

// The bKash payment QR (Admin → Website → bKash payment), kept in
// site_settings 'bkash_payment' as { qr: <image url> }. The checkout shows it
// beside the number for the advance or a pay-in-full order. No QR saved: the
// number alone, as before. As on PAUSE.
export const BKASH_PAY_KEY = 'bkash_payment'

export async function fetchBkashPay() {
  const { value } = await fetchSetting(BKASH_PAY_KEY)
  return { qr: typeof value?.qr === 'string' ? value.qr : '' }
}

export function saveBkashPay({ qr }) {
  return saveSetting(BKASH_PAY_KEY, { qr: qr || '' })
}

export function useBkashPay() {
  const [pay, setPay] = useState({ qr: '' })
  useEffect(() => {
    let alive = true
    fetchBkashPay().then((p) => alive && setPay(p)).catch(() => {})
    return () => { alive = false }
  }, [])
  return pay
}
