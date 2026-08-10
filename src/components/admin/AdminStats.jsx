import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { TrendingUp, Wallet, Package, DollarSign, Clock, TrendingDown } from 'lucide-react';

// Explicit literal classes (not built dynamically) so Tailwind's JIT scanner picks them up.
const accents = {
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-l-emerald-500', value: 'text-emerald-700' },
  green:   { bg: 'bg-green-50',   icon: 'text-green-600',   border: 'border-l-green-500',   value: 'text-green-700' },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   border: 'border-l-amber-500',   value: 'text-amber-700' },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600',  border: 'border-l-violet-500',  value: 'text-violet-700' },
  blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    border: 'border-l-blue-500',    value: 'text-blue-700' },
  rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600',    border: 'border-l-rose-500',    value: 'text-rose-700' },
};

export default function AdminStats() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: o }, { data: p }] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('products').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      setOrders(o || []);
      setProducts(p || []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-sand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const investment = products.reduce((s, p) => s + ((p.cost_price || 0) * (p.quantity || 0)), 0);
  const stockValue = products.reduce((s, p) => s + ((p.price || 0) * (p.quantity || 0)), 0);
  const potentialProfit = stockValue - investment;

  const productMap = {};
  products.forEach(p => { productMap[p.id] = p; });
  let realizedProfit = 0;
  orders.forEach(o => {
    (o.items || []).forEach(item => {
      const product = item.product_id ? productMap[item.product_id] : null;
      const cost = product ? (product.cost_price || 0) : 0;
      realizedProfit += ((item.price || 0) - cost) * (item.quantity || 0);
    });
  });

  const stockQuantity = products.reduce((s, p) => s + (p.quantity || 0), 0);
  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const deliveredCount = orders.filter(o => o.status === 'delivered').length;

  const stats = [
    { label: 'Total Revenue', value: `৳${revenue.toLocaleString()}`, sub: `${orders.length} total orders`, icon: DollarSign, color: 'emerald' },
    { label: 'Realized Profit', value: `৳${realizedProfit.toLocaleString()}`, sub: 'From sold items', icon: TrendingUp, color: 'green' },
    { label: 'Investment in Stock', value: `৳${investment.toLocaleString()}`, sub: 'Current inventory cost', icon: Wallet, color: 'amber' },
    { label: 'Potential Profit', value: `৳${potentialProfit.toLocaleString()}`, sub: 'If all stock sold', icon: potentialProfit >= 0 ? TrendingUp : TrendingDown, color: 'violet' },
    { label: 'Stock Quantity', value: stockQuantity, sub: `${products.length} products`, icon: Package, color: 'blue' },
    { label: 'Pending Orders', value: pendingCount, sub: `${deliveredCount} delivered`, icon: Clock, color: 'rose' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {stats.map((s, i) => {
        const a = accents[s.color];
        return (
          <div key={i} className={`bg-white border border-sand/20 border-l-4 ${a.border} p-6 shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] tracking-[0.2em] uppercase text-obsidian/40">{s.label}</p>
              <div className={`w-9 h-9 flex items-center justify-center ${a.bg}`}>
                <s.icon size={17} strokeWidth={2} className={a.icon} />
              </div>
            </div>
            <p className={`text-2xl font-mono font-semibold ${a.value}`}>{s.value}</p>
            <p className="text-xs text-obsidian/40 mt-1">{s.sub}</p>
          </div>
        );
      })}
    </div>
  );
}
