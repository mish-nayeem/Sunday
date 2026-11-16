// What the admin saves under Website shows on the shop: Business details on
// the Contact pages and the licence in the footer. Supabase is mocked.
import { test, expect } from '@playwright/test'

const SB = /https:\/\/[a-z0-9]+\.supabase\.co\//

// Serve these site_settings keys; everything else is empty.
async function mock(page, settings) {
  await page.route(SB, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const one = (req.headers().accept || '').includes('vnd.pgrst.object')
    if (url.pathname === '/rest/v1/site_settings') {
      const key = Object.keys(settings).find((k) => url.search.includes(`key=eq.${k}`))
      if (key) {
        const row = { value: settings[key] }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(one ? row : [row]) })
      }
    }
    if (url.pathname.startsWith('/functions/')) return route.fulfill({ contentType: 'application/json', body: '{}' })
    if (url.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ contentType: 'application/json', body: 'null' })
    return route.fulfill({ contentType: 'application/json', body: one ? 'null' : '[]' })
  })
}

test('business details: on the Contact pages and in the footer, only the filled ones', async ({ page }) => {
  await mock(page, { business_details: { legal_name: 'SUNDAY Clothing', trade_license: 'TRAD/DNCC/123456', dbid: '' } })

  await page.goto('/support/contact')
  const block = page.getByRole('region', { name: 'Business details' })
  await expect(block).toContainText('SUNDAY Clothing')
  await expect(block).toContainText('TRAD/DNCC/123456')
  await expect(block).not.toContainText('DBID')
  await expect(page.locator('footer')).toContainText('Trade licence TRAD/DNCC/123456')
  await expect(page.locator('footer')).not.toContainText('DBID')

  await page.goto('/contact')
  await expect(page.getByRole('region', { name: 'Business details' })).toContainText('SUNDAY Clothing')
})

test('business details: none saved, nothing shown', async ({ page }) => {
  await mock(page, {})
  await page.goto('/support/contact')
  await expect(page.locator('footer')).toContainText('Dhaka, Bangladesh')
  await expect(page.getByRole('region', { name: 'Business details' })).toHaveCount(0)
  await expect(page.locator('footer')).not.toContainText('Trade licence')
})
