import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Pencil, Trash2, X } from 'lucide-react';

export default function AdminCustomers() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // customer object being edited
  const [form, setForm] = useState({ name: '', mobile: '', district: '', area: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null); // mobile of customer pending delete confirm

  const load = async () => {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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

  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name || '', mobile: c.mobile || '', district: c.district || '', area: c.area || '' });
  };

  const closeEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    await supabase
      .from('orders')
      .update({ full_name: form.name, mobile: form.mobile, district: form.district, area: form.area })
      .eq('mobile', editing.mobile);
    setSaving(false);
    setEditing(null);
    load();
  };

  const confirmDelete = (c) => setDeleting(c);

  const doDelete = async () => {
    if (!deleting) return;
    const mobile = deleting.mobile;
    setSaving(true);
    await supabase.from('invoices').delete().eq('customer_mobile', mobile);
    await supabase.from('orders').delete().eq('mobile', mobile);
    setSaving(false);
    setDeleting(null);
    load();
  };

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
              <th className="py-3 px-4"></th>
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
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3 justify-end">
                    <button onClick={() => openEdit(c)} className="text-charcoal/40 hover:text-wine transition-colors" aria-label="Edit customer">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => confirmDelete(c)} className="text-charcoal/40 hover:text-red-600 transition-colors" aria-label="Delete customer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm border border-gold/20 p-6 relative">
            <button onClick={closeEdit} className="absolute top-4 right-4 text-charcoal/40 hover:text-charcoal"><X size={16} /></button>
            <p className="text-[11px] tracking-[0.2em] uppercase text-charcoal/40 mb-4">Edit Customer</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] tracking-[0.1em] uppercase text-charcoal/40">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full mt-1 border border-gold/30 px-3 py-2 text-sm focus:outline-none focus:border-wine" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.1em] uppercase text-charcoal/40">Mobile</label>
                <input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))}
                  className="w-full mt-1 border border-gold/30 px-3 py-2 text-sm font-mono focus:outline-none focus:border-wine" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.1em] uppercase text-charcoal/40">District</label>
                <input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                  className="w-full mt-1 border border-gold/30 px-3 py-2 text-sm focus:outline-none focus:border-wine" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.1em] uppercase text-charcoal/40">Area</label>
                <input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
                  className="w-full mt-1 border border-gold/30 px-3 py-2 text-sm focus:outline-none focus:border-wine" />
              </div>
            </div>
            <p className="text-[11px] text-charcoal/40 mt-3">Eta customer-er shob order-e update hobe.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={saveEdit} disabled={saving} className="flex-1 bg-wine text-white text-[11px] tracking-[0.15em] uppercase py-2.5 hover:bg-wine/90 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={closeEdit} className="flex-1 border border-gold/30 text-[11px] tracking-[0.15em] uppercase py-2.5 hover:bg-ivory transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm border border-gold/20 p-6">
            <p className="text-[11px] tracking-[0.2em] uppercase text-charcoal/40 mb-3">Delete Customer</p>
            <p className="text-sm text-charcoal/70">
              <span className="font-medium">{deleting.name}</span> ({deleting.mobile}) ke delete korle tar {deleting.orderCount} ta order ar related invoice shob delete hoye jabe. Eta ferot ana jabe na.
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={doDelete} disabled={saving} className="flex-1 bg-red-600 text-white text-[11px] tracking-[0.15em] uppercase py-2.5 hover:bg-red-700 transition-colors disabled:opacity-50">
                {saving ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={() => setDeleting(null)} className="flex-1 border border-gold/30 text-[11px] tracking-[0.15em] uppercase py-2.5 hover:bg-ivory transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
