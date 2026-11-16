import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DELIVERY, isSizeAvailable, isSoldOut, formatPrice } from '../../src/lib/catalog.js'
import { saleFor, salePrice } from '../../src/admin/lib/sales.js'
import { bdPhone } from '../../src/lib/phone.js'
import { localMobile } from '../../src/lib/shopNumbersRules.js'
import { canonicalPath } from '../../src/lib/canonical.js'

// The newest migration that defines create_order: what the database charges.
function createOrderSql() {
  const dir = new URL('../../supabase/migrations/', import.meta.url)
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const latest = files.filter((f) => /function\s+public\.create_order\s*\(/i.test(readFileSync(new URL(f, dir), 'utf8'))).pop()
  const sql = readFileSync(new URL(latest, dir), 'utf8')
  const from = sql.search(/function\s+public\.create_order\s*\(/i)
  return sql.slice(from, sql.indexOf('$function$;', from) > 0 ? sql.indexOf('$function$;', from) : undefined)
}

describe('delivery — checkout and create_order charge the same', () => {
  const sql = createOrderSql()

  it('Tk 80 in Dhaka and Tk 120 outside, as create_order sets them', () => {
    const charges = [...sql.matchAll(/v_delivery_charge\s*:=\s*(\d+)\s*;/g)].map((m) => Number(m[1]))
    expect(charges).toContain(DELIVERY.insideDhaka)
    expect(charges).toContain(DELIVERY.outsideDhaka)
    expect(DELIVERY).toMatchObject({ insideDhaka: 80, outsideDhaka: 120 })
  })

  it('the bKash advance is the one create_order asks for', () => {
    const m = sql.match(/'bkash_advance'\s+then\s+least\((\d+),/i)
    expect(Number(m?.[1])).toBe(DELIVERY.outsideAdvance)
  })

  it('Checkout reads its charges from DELIVERY, not numbers of its own', () => {
    const page = readFileSync(new URL('../../src/pages/Checkout.jsx', import.meta.url), 'utf8')
    expect(page).toMatch(/price:\s*DELIVERY\.insideDhaka/)
    expect(page).toMatch(/price:\s*DELIVERY\.outsideDhaka/)
    expect(page).toMatch(/OUTSIDE_ADVANCE\s*=\s*DELIVERY\.outsideAdvance/)
  })
})

describe('stock — which sizes can be bought', () => {
  it('counted per size: only sizes with pieces left', () => {
    const p = { sizes: ['M', 'L'], size_stock: { M: 2, L: 0 } }
    expect(isSizeAvailable(p, 'M')).toBe(true)
    expect(isSizeAvailable(p, 'L')).toBe(false)
    expect(isSoldOut(p)).toBe(false)
  })

  it('a size switched off in the admin is out, whatever the count', () => {
    expect(isSizeAvailable({ size_stock: { M: 5 }, sizes_out: ['M'] }, 'M')).toBe(false)
  })

  it('not counted per size: for sale unless the piece is marked out of stock', () => {
    expect(isSizeAvailable({ sizes: ['M'], size_stock: {} }, 'M')).toBe(true)
    expect(isSizeAvailable({ sizes: ['M'], stock_status: 'out_of_stock' }, 'M')).toBe(false)
  })

  it('every size gone: sold out', () => {
    expect(isSoldOut({ sizes: ['M', 'L'], size_stock: { M: 0, L: 0 } })).toBe(true)
  })
})

describe('sales — the price shown is the price charged', () => {
  const now = Date.parse('2026-11-16T10:00:00Z')
  const sale = (over) => ({ percent: 20, drop_name: null, product_ids: [], starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-01T00:00:00Z', ...over })

  it('rounds like SQL round(): to the taka, halves up', () => {
    expect(salePrice(1990, 20)).toBe(1592)
    expect(salePrice(1005, 50)).toBe(503)
  })

  it('a store-wide sale covers every piece; the biggest of several wins', () => {
    expect(saleFor({ id: 'a' }, [sale(), sale({ percent: 30 })], now).percent).toBe(30)
  })

  it('a drop sale covers that drop only', () => {
    const s = [sale({ drop_name: 'Summer' })]
    expect(saleFor({ id: 'a', drop: 'Summer' }, s, now)).toBeTruthy()
    expect(saleFor({ id: 'b', drop: 'Winter' }, s, now)).toBeNull()
  })

  it('not started or already ended: no sale', () => {
    expect(saleFor({ id: 'a' }, [sale({ starts_at: '2026-11-20T00:00:00Z' })], now)).toBeNull()
    expect(saleFor({ id: 'a' }, [sale({ ends_at: '2026-11-10T00:00:00Z' })], now)).toBeNull()
  })
})

describe('phone numbers', () => {
  it('Bangladeshi mobiles however typed', () => {
    for (const raw of ['01711111111', '+8801711111111', '8801711111111', '017-1111 1111']) {
      expect(bdPhone(raw)).toBe('01711111111')
      expect(localMobile(raw)).toBe('01711111111')
    }
  })

  it('anything else is not a number', () => {
    for (const raw of ['', '0171111111', '01211111111', 'abc']) {
      expect(bdPhone(raw)).toBe('')
      expect(localMobile(raw)).toBe('')
    }
  })
})

describe('canonical addresses (the site and the worker share this)', () => {
  it('a path without query, trailing slash or tracking tags', () => {
    expect(canonicalPath('/shop/', '')).toBe('/shop')
    expect(canonicalPath('/support/delivery', '?utm_source=ig')).toBe('/support/delivery')
    expect(canonicalPath('/product/abc', '?s=whatsapp')).toBe('/product/abc')
  })

  it('the shop keeps its category or drop, nothing else', () => {
    expect(canonicalPath('/shop', '?category=shirts&sort=price')).toBe('/shop?category=shirts')
    expect(canonicalPath('/shop', '?drop=Summer%20Drop&page=2')).toBe('/shop?drop=Summer%20Drop')
    expect(canonicalPath('/shop', '?category=all')).toBe('/shop')
  })
})

describe('money on screen', () => {
  it('Tk with Indian grouping', () => {
    expect(formatPrice(125000)).toBe('Tk 1,25,000')
    expect(formatPrice(null)).toBe('Tk 0')
  })
})
