import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function AdminCustomers() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
      setOrders(data || []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const customerMap = {};
  orders.forEach(o => {
    const key = o.mobile;
    if (!customerMap[key]) {
      customerMap[key] = { name: o.full_name, mobile: o.mobile, district: o.district, area: o.area, orderCount: 0, totalSpent: 0, lastOrder: o.created_at };
    }
    customerMap[key].orderCount++;
    customerMap[key].totalSpent += o.total || 0;
    if (new Date(o.created_at) > new Date(customerMap[key].lastOrder)) customerMap[key].lastOrder = o.created_at;
  });

  const customers = Object.values(customerMap).sort((a, b) => b.totalSpent - a.totalSpent);
  const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-charcoal/50">{customers.length} customers · Total Revenue: <span className="font-mono font-medium text-charcoal">৳{totalRevenue.toLocaleString()}</span></p>
      </div>
      <div className="bg-white border border-gold/20 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gold/20 bg-ivory">
              <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left">Customer</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left hidden md:table-cell">Location</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-center">Orders</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-right">Total Spent</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left hidden md:table-cell">Last Order</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={i} className="border-b border-gold/10 hover:bg-ivory/50 transition-colors">
                <td className="py-3 px-4">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-charcoal/40 font-mono">{c.mobile}</p>
                </td>
                <td className="py-3 px-4 hidden md:table-cell">
                  <p className="text-sm text-charcoal/60">{c.area}</p>
                  <p className="text-xs text-charcoal/40">{c.district}</p>
                </td>
                <td className="py-3 px-4 text-center"><span className="text-sm font-mono">{c.orderCount}</span></td>
                <td className="py-3 px-4 text-right"><span className="text-sm font-mono font-medium">৳{c.totalSpent.toLocaleString()}</span></td>
                <td className="py-3 px-4 hidden md:table-cell">
                  <span className="text-xs text-charcoal/40">{new Date(c.lastOrder).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
