// The pieces that came back faulty or damaged (Products / Inventory →
// Damaged): from each resolved return request, the resolution's pieces
// marked `damaged: true` by admin_process_return. They're never restocked,
// so what they cost to make is the production loss. As on PAUSE.

export const taka = (n) => '৳ ' + Math.round(Number(n || 0)).toLocaleString()

// returns: the admin's order_returns rows; byId: Map of product id → product.
export function damagedPieces(returns, byId) {
  const out = []
  for (const r of returns) {
    if (r.status !== 'resolved') continue
    const res = r.resolution || {}
    for (const x of Array.isArray(res.items) ? res.items : []) {
      if (!x?.damaged) continue
      const p = byId.get(String(x.product_id))
      const size = x.size || x.from_size || ''
      const qty = Number(x.qty) || 0
      const price = Number(x.price ?? x.from_price ?? p?.price) || 0
      const cost = p?.cost == null || p.cost === '' ? null : Number(p.cost)
      const fresh = res.action === 'exchange' && String(x.to_product_id || x.product_id) === String(x.product_id) && x.to_size === x.from_size
      const outcome = res.action === 'refund'
        ? `Refunded${Number(res.refund) ? ` ${taka(res.refund)}` : ''}`
        : fresh ? 'Fresh copy sent'
          : `Exchanged for ${x.to_product_name && String(x.to_product_id) !== String(x.product_id) ? `${x.to_product_name} ` : ''}${x.to_size || ''}`.trim()
      out.push({
        key: `${r.id}-${x.item_id}-${size}`,
        at: r.resolved_at || res.at || r.created_at,
        orderId: r.order_id,
        customer: r.orders?.customer_name || '',
        reason: r.reason,
        note: r.details || '',
        product: p,
        name: x.product_name || p?.name || 'Product',
        variant: p?.variant || '',
        size, qty, price, cost, outcome,
      })
    }
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)))
}
