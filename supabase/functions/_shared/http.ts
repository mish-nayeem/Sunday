// Outbound requests with a time limit — and, where sending twice can't do
// harm, one more try (audit MEDIUM-6).
//
// Without a limit, a slow Brevo, Meta, courier or Gemini held a function
// until the platform cut it off, and the email, booking or sync it was doing
// simply didn't happen, with nothing to say why. Now a request that takes
// longer than `timeoutMs` is abandoned with a clear error the caller already
// handles (and Sentry hears about).
//
// `retries` is for requests that are safe to repeat: reading a status, a
// Meta event carrying an event_id (Meta keeps one copy), a token. Never for
// one that creates something — a courier booking, an email, a push — where a
// second try after a slow first one that did get through would make two.
// A retry happens only after a network failure, a timeout, a 429 or a 5xx.

export interface FetchOptions {
  timeoutMs?: number
  retries?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  { timeoutMs = 10_000, retries = 0 }: FetchOptions = {},
): Promise<Response> {
  let attempt = 0
  while (true) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (attempt < retries && (res.status === 429 || res.status >= 500)) {
        await res.body?.cancel()
        attempt++
        await sleep(400 * attempt)
        continue
      }
      return res
    } catch (err) {
      const timedOut = err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')
      if (attempt < retries) {
        attempt++
        await sleep(400 * attempt)
        continue
      }
      const host = (() => { try { return new URL(String(url)).host } catch { return 'the service' } })()
      throw new Error(timedOut ? `${host} didn't answer within ${Math.round(timeoutMs / 1000)}s` : `Couldn't reach ${host}: ${(err as Error).message}`)
    }
  }
}
