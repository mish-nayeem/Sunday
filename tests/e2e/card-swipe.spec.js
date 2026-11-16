// Shop cards on a phone: a swipe on the photo shows the next or the last
// photo (as on PAUSE), with a dot for each, and doesn't open the product;
// a tap still does. Supabase and the photos are mocked.
import { test, expect } from '@playwright/test'

const SB = /https:\/\/[a-z0-9]+\.supabase\.co\//
const ID = '11111111-1111-1111-1111-111111111111'
const PHOTOS = ['a', 'b', 'c'].map((n) => `https://abcd.supabase.co/storage/v1/object/public/images/${n}.png`)
const PRODUCT = {
  id: ID, name: 'Test Shirt', price: 1500, images: PHOTOS, sizes: ['M', 'L'], size_stock: { M: 3, L: 2 },
  colors: [], stock_status: 'in_stock', hidden: false, category: 'shirts', created_at: '2026-11-01T00:00:00Z',
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function mock(page) {
  await page.route(SB, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.pathname.startsWith('/storage/')) return route.fulfill({ contentType: 'image/png', body: PNG })
    const one = (req.headers().accept || '').includes('vnd.pgrst.object')
    if (url.pathname === '/rest/v1/products') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(one ? PRODUCT : [PRODUCT]) })
    if (url.pathname.startsWith('/functions/')) return route.fulfill({ contentType: 'application/json', body: '{}' })
    if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ contentType: 'application/json', body: 'null' })
    return route.fulfill({ contentType: 'application/json', body: one ? 'null' : '[]' })
  })
  await page.route(/\/cdn-cgi\/image\//, (route) => route.fulfill({ contentType: 'image/png', body: PNG }))
}

// A finger dragging across the element by dx, dy pixels.
function swipe(locator, dx, dy = 0) {
  return locator.evaluate((el, [dx, dy]) => {
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const t = (cx, cy) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy })
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t(x, y)], changedTouches: [t(x, y)] }))
    el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(x + dx, y + dy)], changedTouches: [t(x + dx, y + dy)] }))
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t(x + dx, y + dy)] }))
  }, [dx, dy])
}

test('a swipe changes the card\'s photo, round in a circle, without opening it', async ({ page }) => {
  await mock(page)
  await page.goto('/shop')
  const photo = page.locator(`a[href="/product/${ID}"][aria-hidden="true"]`).first()
  await expect(photo).toBeVisible()
  const dots = page.locator('[data-card-dots] i')
  await expect(dots).toHaveCount(3)
  const on = () => dots.evaluateAll((els) => els.findIndex((e) => /\bbg-white(\s|$)/.test(e.className)))
  await expect.poll(on).toBe(0)

  await swipe(photo, -80)
  await expect.poll(on).toBe(1)
  await swipe(photo, 80)
  await expect.poll(on).toBe(0)
  await swipe(photo, 80) // back from the first: the last
  await expect.poll(on).toBe(2)
  // A click right after a swipe doesn't open the product.
  await photo.dispatchEvent('click')
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(/\/shop/)
  // An up/down drag is the page scrolling, not a swipe.
  await swipe(photo, 10, 80)
  await expect.poll(on).toBe(2)
  // …but a tap does.
  await photo.click()
  await expect(page).toHaveURL(new RegExp(`/product/${ID}`))
})
