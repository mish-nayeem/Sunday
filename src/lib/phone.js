// 01XXXXXXXXX, or '' when it isn't a Bangladeshi mobile number — the same
// rule as normalize_bd_phone in the database (+880, spaces and dashes are
// fine).
export function bdPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('880')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('1')) d = `0${d}`;
  return /^01[3-9]\d{8}$/.test(d) ? d : '';
}
