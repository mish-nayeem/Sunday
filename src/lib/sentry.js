// Error reports to Sentry — only when VITE_SENTRY_DSN is set, and even then
// the SDK is fetched after the page is up rather than in the bundle every
// shopper downloads first. Errors caught before it arrives wait in a queue;
// without a DSN every call is a no-op.

const dsn = import.meta.env.VITE_SENTRY_DSN
let sdk = null
const waiting = []

if (dsn) {
  import('@sentry/react').then((S) => {
    S.init({
      dsn,
      environment: import.meta.env.MODE,
      // Error monitoring only — no Tracing, Session Replay or Logging.
    })
    sdk = S
    for (const [err, ctx] of waiting.splice(0)) S.captureException(err, ctx)
  }).catch(() => { /* reporting is best effort */ })
}

function captureException(err, ctx) {
  if (!dsn) return
  if (sdk) sdk.captureException(err, ctx)
  else if (waiting.length < 20) waiting.push([err, ctx])
}

export const Sentry = { captureException }
