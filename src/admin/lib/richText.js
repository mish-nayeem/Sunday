import DOMPurify from 'dompurify'

// Rich text for the Support pages (Admin → Support → Support pages): the
// admin writes it in RichEditor.jsx, the shop shows it with RichText. What's
// saved is HTML, so everything is cleaned on the way out — only formatting
// survives: no scripts, no event handlers, no outside styles or frames.

const TAGS = ['p', 'br', 'div', 'span', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'mark', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr', 'sub', 'sup']
const ATTRS = ['href', 'target', 'rel', 'style']
// The only inline styles kept, and only with plain values (no url()).
const STYLES = ['color', 'background-color', 'font-size', 'text-align', 'margin-left', 'padding-left', 'line-height', 'font-weight', 'font-style', 'text-decoration']

function cleanStyle(value) {
  return String(value || '')
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => {
      const [prop, ...rest] = d.split(':')
      const v = rest.join(':').trim().toLowerCase()
      return STYLES.includes(prop.trim().toLowerCase()) && v && !/url\(|expression|javascript:|@import|\\/.test(v)
    })
    .join('; ')
}

let hooked = false
function hook() {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'style') {
      data.attrValue = cleanStyle(data.attrValue)
      if (!data.attrValue) data.keepAttr = false
    }
  })
  // Links leave in a new tab, without handing the opener over.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      const href = node.getAttribute('href')
      if (/^https?:/i.test(href)) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }
  })
}

export function cleanHtml(html) {
  hook()
  return DOMPurify.sanitize(String(html || ''), {
    ALLOWED_TAGS: TAGS,
    ALLOWED_ATTR: ATTRS,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/(?!\/)|#)/i,
  })
}

// A plain-text section (written before the editor came) as HTML: an empty
// line starts a paragraph, a single line break stays a line break.
export function textToHtml(text) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

// Saved by the editor (HTML), or plain text from before it? About us keeps
// either in the same column, so it's told apart by how it starts.
export function isHtml(s) {
  return /^\s*<(p|h[2-4]|ul|ol|div|blockquote|hr|span|strong|b|em|i|u|br)\b/i.test(String(s || ''))
}

// Plain words of either kind (for a short preview).
export function plainText(s) {
  if (!isHtml(s)) return String(s || '')
  const d = document.createElement('div')
  d.innerHTML = cleanHtml(s)
  return d.textContent || ''
}
