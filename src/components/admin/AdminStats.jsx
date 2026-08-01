import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { TrendingUp, Wallet, Package, DollarSign, Clock } from 'lucide-react';

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
    { label: 'Total Revenue', value: `৳${revenue.toLocaleString()}`, sub: `${orders.length} total orders`, icon: DollarSign },
    { label: 'Realized Profit', value: `৳${realizedProfit.toLocaleString()}`, sub: 'From sold items', icon: TrendingUp },
    { label: 'Investment in Stock', value: `৳${investment.toLocaleString()}`, sub: 'Current inventory cost', icon: Wallet },
    { label: 'Potential Profit', value: `৳${potentialProfit.toLocaleString()}`, sub: 'If all stock sold', icon: TrendingUp },
    { label: 'Stock Quantity', value: stockQuantity, sub: `${products.length} products`, icon: Package },
    { label: 'Pending Orders', value: pendingCount, sub: `${deliveredCount} delivered`, icon: Clock },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {stats.map((s, i) => (
        <div key={i} className="bg-white border border-sand/30 p-6">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] tracking-[0.2em] uppercase text-obsidian/40">{s.label}</p>
            <s.icon size={18} strokeWidth={1} className="text-sand" />
          </div>
          <p className="text-2xl font-mono font-medium">{s.value}</p>
          <p className="text-xs text-obsidian/40 mt-1">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}
