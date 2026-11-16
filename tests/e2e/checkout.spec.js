// The path that makes the shop money, on a phone: a product → a size →
// Add to bag → checkout → place the order → the confirmation. Supabase is
// mocked (one product, everything else empty) and create_order's answer is
// faked — what's checked is what the browser sends and what the shopper sees.
import { test, expect } from '@playwright/test'

const SB = /https:\/\/[a-z0-9]+\.supabase\.co\//
const ID = '11111111-1111-1111-1111-111111111111'
const PRODUCT = {
  id: ID, sku: 'SND-T1', name: 'Test Shirt', variant: '', price: 1500, original_price: null, drop_name: null,
  category: 'shirts', images: [], description: 'A test shirt.', sizes: ['M', 'L'], size_stock: { M: 3, L: 2 },
  colors: [], stock_status: 'in_stock', hidden: false, created_at: '2026-11-01T00:00:00Z', publish_at: null,
}

function mock(page, onOrder) {
  return page.route(SB, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const one = (req.headers().accept || '').includes('vnd.pgrst.object')
    if (url.pathname === '/rest/v1/rpc/create_order' || url.pathname === '/rest/v1/rpc/create_order_checked') {
      onOrder?.(req.postDataJSON())
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ order_id: 'SND-TEST-1', invoice_number: 'INV-1', subtotal: 1500, delivery_charge: 80, total: 1580 }]) })
    }
    if (url.pathname === '/rest/v1/rpc/track_order') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ order_id: 'SND-TEST-1', status: 'pending', items: [{ product_name: 'Test Shirt', size: 'M', quantity: 1, price: 1500 }], subtotal: 1500, delivery_charge: 80, total: 1580, advance_amount: 0, full_name: 'Test Shopper', mobile: '01711111111', created_at: new Date().toISOString(), courier_steps: [] }]) })
    }
    if (url.pathname === '/rest/v1/products') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(one ? PRODUCT : [PRODUCT]) })
    }
    if (url.pathname.startsWith('/auth/')) return route.fulfill({ contentType: 'application/json', body: '{}' })
    if (url.pathname.startsWith('/functions/')) return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' })
    if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ contentType: 'application/json', body: 'null' })
    return route.fulfill({ contentType: 'application/json', body: one ? 'null' : '[]' })
  })
}

test('a shopper can buy a shirt in Dhaka', async ({ page }) => {
  let sent = null
  await mock(page, (body) => { sent = body })
  const crashes = []
  page.on('pageerror', (e) => crashes.push(e.message))

  await page.goto(`/product/${ID}`)
  await expect(page.getByRole('heading', { name: 'Test Shirt' }).first()).toBeVisible()

  // The phone's buying bar: no size yet → it asks for one instead of adding.
  const bar = page.locator('div.fixed.bottom-0').filter({ hasText: 'Add to bag' })
  await bar.getByRole('button', { name: 'Add to bag' }).click()
  await bar.getByRole('button', { name: /^M$/ }).click()
  await bar.getByRole('button', { name: 'Add to bag' }).click()
  await expect(page.getByText('Item added to cart')).toBeVisible()

  await page.goto('/checkout')
  await page.fill('#co-email', 'shopper@example.com')
  await page.fill('#co-mobile', '01711111111')
  await page.fill('#co-name', 'Test Shopper')
  await page.selectOption('#co-district', 'Dhaka')
  await page.fill('#co-area', 'Dhanmondi')
  await page.fill('#co-address', 'House 1, Road 2')
  // Dhaka: Tk 80 delivery, cash on delivery.
  await expect(page.getByText('Tk 1,580').first()).toBeVisible()
  await page.locator('input[type="checkbox"]').last().check()
  await page.getByRole('button', { name: /place order/i }).click()

  await expect(page).toHaveURL(/\/order-confirmation\/SND-TEST-1/)
  await expect(page.getByText('SND-TEST-1').first()).toBeVisible()

  // What the browser asked for: only ids, sizes and quantities — the
  // database prices them itself.
  expect(sent.p_items).toEqual([{ product_id: ID, size: 'M', quantity: 1 }])
  expect(sent).toMatchObject({ p_district: 'Dhaka', p_mobile: '01711111111', p_payment_method: 'cod' })
  expect(JSON.stringify(sent)).not.toMatch(/price|total/)
  expect(crashes).toEqual([])
})

test('every main page opens without a crash', async ({ page }) => {
  await mock(page)
  const crashes = []
  page.on('pageerror', (e) => crashes.push(e.message))
  for (const path of ['/', '/shop', `/product/${ID}`, '/cart', '/checkout', '/order-tracking', '/login', '/support/delivery', '/support/faq', '/about', '/contact', '/wishlist', '/no-such-page']) {
    await page.goto(path)
    await expect(page.locator('#root > *').first()).toBeVisible()
    await expect(page.locator('h1').first()).toBeAttached()
  }
  expect(crashes).toEqual([])
})
