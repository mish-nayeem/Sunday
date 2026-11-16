import { useEffect, useState } from 'react'
import { fetchSetting, saveSetting } from './siteSettings.js'

// The shop's legal details (Admin → Website → Business details), kept in
// site_settings 'business_details'. Bangladesh's Digital Commerce Operation
// Guidelines ask an online shop to show who it is — a name, an address, a
// trade licence and so on. Each one shows on the site only once it's filled:
// the Contact pages list them, the footer's small print carries the licence.
// As on PAUSE.

export const BUSINESS_KEY = 'business_details'

export const BUSINESS_FIELDS = [
  { key: 'legal_name', label: 'Business name (as registered)', placeholder: 'e.g. SUNDAY' },
  { key: 'owner', label: 'Owner / proprietor', placeholder: 'Name on the trade licence' },
  { key: 'address', label: 'Business address', placeholder: 'House, road, area, Dhaka', long: true },
  { key: 'trade_license', label: 'Trade licence no.', placeholder: 'From the city corporation' },
  { key: 'dbid', label: 'DBID (Digital Business ID)', placeholder: 'From the Ministry of Commerce' },
  { key: 'tin', label: 'e-TIN / BIN', placeholder: 'Optional' },
  { key: 'phone', label: 'Business phone', placeholder: 'Shown with the details' },
  { key: 'email', label: 'Business email', placeholder: 'Shown with the details' },
  { key: 'hours', label: 'Opening hours', placeholder: 'e.g. Sat–Thu, 11am–8pm' },
]

const clean = (v) => Object.fromEntries(BUSINESS_FIELDS.map((f) => [f.key, String(v?.[f.key] ?? '').trim()]))

export async function fetchBusiness() {
  const { value } = await fetchSetting(BUSINESS_KEY)
  return clean(value)
}

export function saveBusiness(details) {
  return saveSetting(BUSINESS_KEY, clean(details))
}

// For the shop: the saved details (null until they've loaded).
export function useBusiness() {
  const [details, setDetails] = useState(null)
  useEffect(() => {
    let alive = true
    fetchBusiness().then((d) => alive && setDetails(d)).catch(() => {})
    return () => { alive = false }
  }, [])
  return details
}

// The filled ones, in order.
export function filledFields(details) {
  if (!details) return []
  return BUSINESS_FIELDS.filter((f) => details[f.key]).map((f) => ({ ...f, value: details[f.key] }))
}
