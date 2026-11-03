// Structured data for search engines, as a <script type="application/ld+json">
// body. JSON.stringify alone leaves "<" as it is, so a product name or
// description containing "</script>" would end the tag early and the rest
// would be read as page HTML. Escaping <, > and & (and the two line
// separators JavaScript treats as new lines) keeps it valid JSON that can
// never close the tag.
const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)
const UNSAFE = new RegExp('[<>&' + LS + PS + ']', 'g')
const hex = (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')

export function jsonLd(data) {
  return JSON.stringify(data).replace(UNSAFE, hex)
}
