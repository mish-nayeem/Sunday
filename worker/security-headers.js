// Browser security headers for every page the site serves. Two places send
// them: public/_headers for what Cloudflare serves straight from the build
// (written from this list at build time by scripts/generate-headers.mjs),
// and worker/index.js for the pages that go through the Worker first
// (/product/*, /lookbook/*, /admin — wrangler.jsonc's run_worker_first).
//
// The CSP allows exactly what the site loads from outside its own address:
//   Supabase      — data, login, edge functions and photos (https + wss)
//   Google Fonts  — the stylesheet and the font files
// Photos and the hero video may come from any https host, so an old link
// (a Cloudinary photo, a pasted video) never shows as broken. A new outside
// script, pixel or API has to be added here, or the browser will block it.

const SUPABASE = 'qgvadxivqtlgobfzbdxt.supabase.co'

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  `connect-src 'self' https://${SUPABASE} wss://${SUPABASE}`,
  // The admin's email preview is an <iframe srcdoc>, on this site.
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  // HTTPS only: once a browser has seen this, it never tries plain http for
  // the site (or a subdomain) again for a year.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

export function withSecurityHeaders(response) {
  const res = new Response(response.body, response)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value)
  return res
}
