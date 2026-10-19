// Timed sales from Admin → Marketing → Sales, applied to SUNDAY's products.
// create_order charges the same price through public.sale_price(), so what a
// shopper sees here is what the order costs.
import { useEffect, useState } from 'react';
import { fetchLiveSales, saleFor, salePrice } from '@/admin/lib/sales.js';

export function useLiveSales() {
  const [sales, setSales] = useState([]);
  useEffect(() => {
    let alive = true;
    fetchLiveSales().then((s) => alive && setSales(s));
    return () => { alive = false; };
  }, []);
  return sales;
}

// The product as it sells right now. `price` is what goes in the bag;
// `compare_at` and `sale` are there to show the saving. Without a sale the
// product's own original_price (a standing markdown) is the compare-at price.
export function withSale(product, sales) {
  if (!product) return product;
  const s = saleFor({ ...product, drop: product.drop_name }, sales);
  if (!s) {
    const was = Number(product.original_price) > Number(product.price) ? Number(product.original_price) : null;
    return { ...product, compare_at: was, sale: null };
  }
  return {
    ...product,
    price: salePrice(product.price, s.percent),
    compare_at: Number(product.price),
    sale: { percent: s.percent, endsAt: s.ends_at, name: s.name },
  };
}
