import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ChevronDown, Bell, Phone } from 'lucide-react';

const statusOptions = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  processing: 'bg-purple-100 text-purple-700',
  shipped: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [newOrderIds, setNewOrderIds] = useState([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
      setOrders(data || []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        setOrders(prev => [payload.new, ...prev]);
        setNewOrderIds(prev => [payload.new.id, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const handleStatusChange = async (orderId, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
  };

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-sand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {pendingCount > 0 && (
        <div className="bg-sand/20 border border-sand p-4 mb-6 flex items-center gap-3">
          <Bell size={18} className="text-obsidian animate-pulse" />
          <p className="text-sm font-medium">{pendingCount} new order{pendingCount > 1 ? 's' : ''} pending confirmation</p>
        </div>
      )}

      {orders.length === 0 ? (
        <p className="text-center text-obsidian/40 py-20">No orders yet</p>
      ) : (
        <div className="bg-white border border-sand/30 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sand/30 bg-mist">
                <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-left">Order ID</th>
                <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-left">Customer</th>
                <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-left hidden md:table-cell">Mobile</th>
                <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-right">Total</th>
                <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-left">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <React.Fragment key={order.id}>
                  <tr className={`border-b border-sand/10 hover:bg-mist/50 transition-colors ${newOrderIds.includes(order.id) ? 'bg-sand/10' : ''}`}>
                    <td className="py-3 px-4">
                      <p className="text-xs font-mono font-medium">{order.order_id}</p>
                      <p className="text-[10px] text-obsidian/30 mt-0.5">
                        {new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium">{order.full_name}</p>
                      <p className="text-xs text-obsidian/40">{order.district}</p>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <p className="text-sm text-obsidian/60 font-mono">{order.mobile}</p>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <p className="text-sm font-mono font-medium">৳{order.total?.toLocaleString()}</p>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={order.status}
                        onChange={e => handleStatusChange(order.id, e.target.value)}
                        className={`text-[10px] tracking-wider uppercase border-none px-3 py-1.5 cursor-pointer outline-none ${statusColors[order.status] || 'bg-gray-100 text-gray-700'}`}
                      >
                        {statusOptions.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                        className="p-1"
                      >
                        <ChevronDown size={16} className={`transition-transform ${expanded === order.id ? 'rotate-180' : ''}`} />
                      </button>
                    </td>
                  </tr>
                  {expanded === order.id && (
                    <tr className="bg-mist/30">
                      <td colSpan={6} className="py-4 px-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <p className="text-[10px] tracking-[0.2em] uppercase text-obsidian/40 mb-2">Delivery Address</p>
                            <p className="text-sm">{order.address}</p>
                            <p className="text-sm text-obsidian/60">{order.area}, {order.district}</p>
                            <div className="flex items-center gap-2 mt-2 text-sm text-obsidian/60">
                              <Phone size={12} /> {order.mobile}
                            </div>
                            {order.notes && (
                              <p className="text-xs text-obsidian/50 mt-2">Note: {order.notes}</p>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] tracking-[0.2em] uppercase text-obsidian/40 mb-2">Items</p>
                            {order.items?.map((item, i) => (
                              <div key={i} className="flex justify-between text-sm py-1 border-b border-sand/10 last:border-0">
                                <span>{item.name} (Size: {item.size}) × {item.quantity}</span>
                                <span className="font-mono">৳{(item.price * item.quantity).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
