// Meta: with a Pixel ID saved, each shop event goes to the Pixel and to the
// server (meta-capi) under one event id, so Meta counts it once even when an
// ad blocker stops the Pixel (audit MEDIUM-9). Supabase and Meta are mocked.
import { test, expect } from '@playwright/test'

const SB = /https:\/\/[a-z0-9]+\.supabase\.co\//
const ID = '11111111-1111-1111-1111-111111111111'
const PRODUCT = {
  id: ID, name: 'Test Shirt', price: 1500, images: [], sizes: ['M', 'L'], size_stock: { M: 3, L: 2 },
  colors: [], stock_status: 'in_stock', hidden: false, category: 'shirts', created_at: '2026-11-01T00:00:00Z',
}

test('ViewContent and AddToCart reach the server with the Pixel\'s event id', async ({ page }) => {
  const server = []
  await page.route('https://connect.facebook.net/**', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }))
  await page.route(SB, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const one = (req.headers().accept || '').includes('vnd.pgrst.object')
    if (url.pathname === '/functions/v1/meta-capi') {
      server.push(req.postDataJSON())
      return route.fulfill({ contentType: 'application/json', body: '{"sent":true}' })
    }
    if (url.pathname === '/rest/v1/site_settings' && url.search.includes('meta_pixel')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(one ? { value: { id: '123456789' } } : [{ value: { id: '123456789' } }]) })
    }
    if (url.pathname === '/rest/v1/products') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(one ? PRODUCT : [PRODUCT]) })
    if (url.pathname.startsWith('/functions/')) return route.fulfill({ contentType: 'application/json', body: '{}' })
    if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ contentType: 'application/json', body: 'null' })
    return route.fulfill({ contentType: 'application/json', body: one ? 'null' : '[]' })
  })
  // What the page told the Pixel: each track call and its event id.
  await page.addInitScript(() => {
    window.__pixel = []
    Object.defineProperty(window, 'fbq', {
      configurable: true,
      get() { return this.__fbq },
      set(fn) {
        const wrapped = function (...args) { if (args[0] === 'track') window.__pixel.push({ event: args[1], id: args[3]?.eventID }); return fn.apply(this, args) }
        Object.assign(wrapped, fn)
        this.__fbq = wrapped
      },
    })
  })

  await page.goto(`/product/${ID}`)
  await expect(page.getByRole('heading', { name: 'Test Shirt' }).first()).toBeVisible()
  const bar = page.locator('div.fixed.bottom-0').filter({ hasText: 'Add to bag' })
  await bar.getByRole('button', { name: 'Add to bag' }).click()
  await bar.getByRole('button', { name: /^M$/ }).click()
  await bar.getByRole('button', { name: 'Add to bag' }).click()

  await expect.poll(() => server.map((e) => e.event)).toEqual(expect.arrayContaining(['ViewContent', 'AddToCart']))
  const pixel = await page.evaluate(() => window.__pixel)
  for (const name of ['ViewContent', 'AddToCart']) {
    const s = server.find((e) => e.event === name)
    const p = pixel.find((e) => e.event === name)
    expect(s.event_id).toBeTruthy()
    expect(s.event_id).toBe(p.id)
    expect(s.url).toContain(`/product/${ID}`)
    expect(s.custom_data.content_ids).toEqual([ID])
  }
})
