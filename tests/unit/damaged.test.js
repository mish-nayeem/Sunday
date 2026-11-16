import { describe, expect, it } from 'vitest'
import { damagedPieces } from '../../src/admin/lib/damaged.js'

// The shapes admin_process_return writes into order_returns.resolution
// (supabase/migrations/20261107180000_item_handed_back.sql).
const SHIRT = { id: 'p1', name: 'Oxford Shirt', variant: 'Blue', price: 1500, cost: 600 }
const POLO = { id: 'p2', name: 'Polo', variant: '', price: 1200, cost: null }
const byId = new Map([SHIRT, POLO].map((p) => [p.id, p]))

describe('damaged pieces', () => {
  it('only resolved requests, only the pieces marked damaged', () => {
    const returns = [
      { id: 'r1', order_id: 'SND-1', status: 'resolved', reason: 'Faulty / damaged', resolved_at: '2026-11-10T10:00:00Z', orders: { customer_name: 'Rafi' },
        resolution: { action: 'refund', refund: 1500, items: [
          { item_id: 1, product_id: 'p1', product_name: 'Oxford Shirt', qty: 1, size: 'M', price: 1500, damaged: true },
        ] } },
      { id: 'r2', order_id: 'SND-2', status: 'resolved', reason: 'Wrong size',
        resolution: { action: 'exchange', items: [{ item_id: 1, product_id: 'p1', qty: 1, from_size: 'M', to_size: 'L', damaged: false }] } },
      { id: 'r3', order_id: 'SND-3', status: 'open', reason: 'Faulty / damaged', resolution: null },
    ]
    const out = damagedPieces(returns, byId)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ orderId: 'SND-1', customer: 'Rafi', name: 'Oxford Shirt', variant: 'Blue', size: 'M', qty: 1, price: 1500, cost: 600, outcome: 'Refunded ৳ 1,500' })
  })

  it('a fresh copy of the same size, or another product, says so; no cost stays null', () => {
    const returns = [
      { id: 'r4', order_id: 'SND-4', status: 'resolved', reason: 'Damaged', resolved_at: '2026-11-12T00:00:00Z',
        resolution: { action: 'exchange', items: [
          { item_id: 1, product_id: 'p1', qty: 2, from_size: 'L', to_size: 'L', from_price: 1500, damaged: true, fresh: true },
          { item_id: 2, product_id: 'p2', qty: 1, from_size: 'M', to_size: 'S', to_product_id: 'p1', to_product_name: 'Oxford Shirt', from_price: 1200, damaged: true },
        ] } },
    ]
    const [a, b] = damagedPieces(returns, byId)
    expect(a).toMatchObject({ size: 'L', qty: 2, price: 1500, outcome: 'Fresh copy sent' })
    expect(b).toMatchObject({ name: 'Polo', cost: null, outcome: 'Exchanged for Oxford Shirt S' })
  })

  it('newest first', () => {
    const r = (id, at) => ({ id, order_id: id, status: 'resolved', resolved_at: at, resolution: { action: 'refund', items: [{ item_id: 1, product_id: 'p1', qty: 1, size: 'M', damaged: true }] } })
    expect(damagedPieces([r('A', '2026-11-01T00:00:00Z'), r('B', '2026-11-05T00:00:00Z')], byId).map((d) => d.orderId)).toEqual(['B', 'A'])
  })
})
