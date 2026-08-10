import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ChevronDown, Bell, Phone, Truck, Mail, Check } from 'lucide-react';

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
  const [notifying, setNotifying] = useState(null); // order.id currently sending email
  const [notifyResult, setNotifyResult] = useState({}); // { [order.id]: 'sent' | 'skipped' | 'error' }
  const [trackingDrafts, setTrackingDrafts] = useState({}); // { [order.id]: string }
  const [savingTracking, setSavingTracking] = useState(null);
  const [notifyEnabled, setNotifyEnabled] = useState({}); // { [order.id]: boolean } — default true (checked)

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

  const handleStatusChange = async (order, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', order.id);
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: newStatus } : o));

    const shouldNotify = notifyEnabled[order.id] ?? true; // default: checked
    if (!shouldNotify) return;

    // Best-effort customer email notification — never blocks the status change itself.
    setNotifying(order.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-status-update', {
        body: { order_id: order.order_id, status: newStatus },
      });
      if (error) {
        setNotifyResult(prev => ({ ...prev, [order.id]: 'error' }));
      } else if (data?.skipped) {
        setNotifyResult(prev => ({ ...prev, [order.id]: 'skipped' }));
      } else {
        setNotifyResult(prev => ({ ...prev, [order.id]: 'sent' }));
      }
    } catch {
      setNotifyResult(prev => ({ ...prev, [order.id]: 'error' }));
    }
    setNotifying(null);
    setTimeout(() => setNotifyResult(prev => { const n = { ...prev }; delete n[order.id]; return n; }), 4000);
  };

  const saveTracking = async (order) => {
    const note = trackingDrafts[order.id] ?? order.tracking_note ?? '';
    setSavingTracking(order.id);
    await supabase.from('orders').update({ tracking_note: note }).eq('id', order.id);
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, tracking_note: note } : o));
    setSavingTracking(null);
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={order.status}
                          onChange={e => handleStatusChange(order, e.target.value)}
                          className={`text-[10px] tracking-wider uppercase border-none px-3 py-1.5 cursor-pointer outline-none ${statusColors[order.status] || 'bg-gray-100 text-gray-700'}`}
                        >
                          {statusOptions.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-[10px] text-obsidian/50 cursor-pointer select-none" title="Status change korle customer-ke email jabe kina">
                          <input
                            type="checkbox"
                            checked={notifyEnabled[order.id] ?? true}
                            onChange={e => setNotifyEnabled(prev => ({ ...prev, [order.id]: e.target.checked }))}
                            className="accent-wine"
                          />
                          <Mail size={11} /> notify
                        </label>
                        {notifying === order.id && (
                          <span className="text-[10px] text-obsidian/40 flex items-center gap-1"><Mail size={11} className="animate-pulse" /> sending...</span>
                        )}
                        {notifyResult[order.id] === 'sent' && (
                          <span className="text-[10px] text-green-600 flex items-center gap-1"><Check size={11} /> emailed</span>
                        )}
                        {notifyResult[order.id] === 'skipped' && (
                          <span className="text-[10px] text-obsidian/30">no email on file</span>
                        )}
                        {notifyResult[order.id] === 'error' && (
                          <span className="text-[10px] text-red-500">email failed</span>
                        )}
                      </div>
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

                            <div className="mt-4">
                              <p className="text-[10px] tracking-[0.2em] uppercase text-obsidian/40 mb-2 flex items-center gap-1">
                                <Truck size={12} /> Courier Tracking Info
                              </p>
                              <textarea
                                rows={2}
                                value={trackingDrafts[order.id] ?? order.tracking_note ?? ''}
                                onChange={e => setTrackingDrafts(prev => ({ ...prev, [order.id]: e.target.value }))}
                                placeholder="e.g. Pathao consignment ID PTH-88213, expected delivery 12 Aug"
                                className="w-full border border-sand/40 px-3 py-2 text-sm bg-white outline-none focus:border-wine transition-colors"
                              />
                              <p className="text-[10px] text-obsidian/40 mt-1">Ei text customer-er Track Order page-e show hobe.</p>
                              <button
                                onClick={() => saveTracking(order)}
                                disabled={savingTracking === order.id}
                                className="mt-2 text-[10px] tracking-wider uppercase bg-obsidian text-white px-3 py-1.5 hover:bg-obsidian/90 transition-colors disabled:opacity-50"
                              >
                                {savingTracking === order.id ? 'Saving...' : 'Save Tracking Info'}
                              </button>
                            </div>
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
