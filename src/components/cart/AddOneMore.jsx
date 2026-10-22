import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isSizeAvailable } from '@/lib/catalog';
import { addToCart, updateCartItem } from '@/lib/cartStore';

// The bag's products, for each line's sizes and what's in stock.
export function useBagCatalog(cart, enabled = true) {
  const [catalog, setCatalog] = useState(new Map());
  const ids = [...new Set(cart.map((i) => i.productId))].sort().join(',');
  useEffect(() => {
    if (!enabled || !ids) return;
    supabase.from('products').select('id,sizes,size_stock,sizes_out,quantity,stock_status').in('id', ids.split(','))
      .then(({ data }) => setCatalog(new Map((data || []).map((p) => [p.id, p]))));
  }, [enabled, ids]);
  return catalog;
}

// A bag line's + asks which size the extra one should be: the same size
// adds to the line, another size goes in as a line of its own. Sold-out
// sizes can't be picked.
export default function AddOneMore({ item, product, onDone }) {
  const sizes = product?.sizes?.length ? product.sizes : [item.size];
  const pick = (size) => {
    if (size === item.size) updateCartItem(item.productId, item.size, item.quantity + 1);
    else addToCart({ id: item.productId, name: item.name, price: item.price, images: [item.image], sku: item.sku }, size, 1);
    onDone();
  };
  return (
    <div className="mt-3 p-3 bg-shell">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px]">Add one more — which size?</p>
        <button type="button" onClick={onDone} className="text-[12px] text-graphite hover:text-ink" aria-label="Cancel">Cancel</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sizes.map((sz) => {
          const ok = !product || isSizeAvailable(product, sz);
          return (
            <button
              key={sz}
              type="button"
              disabled={!ok}
              onClick={() => pick(sz)}
              className={`min-w-10 h-9 px-2 text-[12px] border bg-white ${sz === item.size ? 'border-coral' : 'border-coral/25'} hover:border-coral disabled:opacity-40 disabled:line-through disabled:cursor-not-allowed`}
              aria-label={ok ? `Add one in size ${sz}` : `Size ${sz} sold out`}
            >
              {sz}
            </button>
          );
        })}
      </div>
    </div>
  );
}
