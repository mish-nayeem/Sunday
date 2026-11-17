import { describe, expect, it } from 'vitest'
import worker, { hostRedirect, SITE_HOST } from '../../worker/index.js'

// One address for the shop: www and the workers.dev address go to
// sundayclothin.com, path and query kept.
describe('the shop\'s one address', () => {
  it('www and workers.dev redirect to sundayclothin.com, path and query kept', async () => {
    for (const from of ['https://www.sundayclothin.com', 'https://sunday.sunday-8e5.workers.dev']) {
      const res = await worker.fetch(new Request(`${from}/product/abc?utm_source=ig&s=1`), {}, {})
      expect(res.status).toBe(301)
      expect(res.headers.get('location')).toBe(`https://${SITE_HOST}/product/abc?utm_source=ig&s=1`)
    }
  })

  it('the domain itself, previews and form posts are left alone', () => {
    expect(hostRedirect(new Request('https://sundayclothin.com/shop'))).toBeNull()
    expect(hostRedirect(new Request('https://abc123-sunday.sunday-8e5.workers.dev/'))).toBeNull()
    expect(hostRedirect(new Request('http://localhost:4173/'))).toBeNull()
    expect(hostRedirect(new Request('https://www.sundayclothin.com/x', { method: 'POST' }))).toBeNull()
  })
})
