// The shop's own phone numbers, set in Admin → Website → Settings:
//
//   whatsapp — the floating WhatsApp button and "Confirm on WhatsApp" after
//              checkout; kept where they already read it, in the settings
//              table's whatsapp_number (as 8801XXXXXXXXX, the way wa.me wants)
//   bkash    — the bKash (Payment) number the checkout shows to send the
//              advance to; site_settings 'shop_numbers' { bkash }
//
// Nothing saved, or a number that isn't one: the default, as before.
// No imports here, so it can be used anywhere.

export const DEFAULT_BKASH = '01629178834'

// A Bangladeshi mobile number as 01XXXXXXXXX (11 digits), from however it was
// typed: 017…, +880 17…, 8801…, with spaces or dashes. '' when it isn't one.
export function localMobile(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('880')) d = d.slice(2)
  else if (d.length === 10 && d.startsWith('1')) d = '0' + d
  return /^01[3-9]\d{8}$/.test(d) ? d : ''
}
