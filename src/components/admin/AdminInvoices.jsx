import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { FileText, Download, Pencil, Trash2, X } from 'lucide-react';
import { generateInvoicePDF } from '@/lib/invoicePdf';

export default function AdminInvoices() {
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ customer_name: '', customer_mobile: '', total: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    const [{ data: o }, { data: inv }] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    setOrders(o || []);
    setInvoices(inv || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const yearInvoices = invoices.filter(i => i.invoice_number?.includes(`SND-${year}-`));
    return `SND-${year}-${String(yearInvoices.length + 1).padStart(6, '0')}`;
  };

  const handleGenerate = async (order) => {
    setGenerating(order.id);
    const { data: invoice } = await supabase.from('invoices').insert({
      invoice_number: generateInvoiceNumber(),
      order_id: order.order_id,
      customer_name: order.full_name,
      customer_mobile: order.mobile,
      customer_address: `${order.address}, ${order.area}, ${order.district}`,
      items: order.items || [],
      subtotal: order.subtotal || order.total || 0,
      delivery_charge: order.delivery_charge || 0,
      total: order.total || 0,
      issue_date: new Date().toISOString().split('T')[0],
      status: 'issued'
    }).select().single();
    if (invoice) setInvoices(prev => [invoice, ...prev]);
    setGenerating(null);
  };

  const openEdit = (inv) => {
    setEditing(inv);
    setForm({ customer_name: inv.customer_name || '', customer_mobile: inv.customer_mobile || '', total: inv.total ?? '' });
  };

  const closeEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    await supabase
      .from('invoices')
      .update({ customer_name: form.customer_name, customer_mobile: form.customer_mobile, total: Number(form.total) || 0 })
      .eq('id', editing.id);
    setSaving(false);
    setEditing(null);
    load();
  };

  const doDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    await supabase.from('invoices').delete().eq('id', deleting.id);
    setSaving(false);
    setDeleting(null);
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" /></div>;
  }

  const invoicedOrderIds = new Set(invoices.map(i => i.order_id));

  return (
    <div>
      <div className="mb-6 flex gap-4 text-sm text-charcoal/50">
        <span>{invoices.length} invoices issued</span><span>·</span>
        <span>{orders.filter(o => !invoicedOrderIds.has(o.order_id)).length} orders pending invoice</span>
      </div>

      {invoices.length > 0 && (
        <div className="bg-white border border-gold/20 overflow-x-auto mb-8">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold/20 bg-ivory">
                <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left">Invoice #</th>
                <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left">Customer</th>
                <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-right">Total</th>
                <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left hidden md:table-cell">Date</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-b border-gold/10 hover:bg-ivory/50 transition-colors">
                  <td className="py-3 px-4"><p className="text-xs font-mono font-medium">{inv.invoice_number}</p></td>
                  <td className="py-3 px-4"><p className="text-sm">{inv.customer_name}</p></td>
                  <td className="py-3 px-4 text-right"><span className="text-sm font-mono">৳{(inv.total || 0).toLocaleString()}</span></td>
                  <td className="py-3 px-4 hidden md:table-cell"><span className="text-xs text-charcoal/40">{inv.issue_date ? new Date(inv.issue_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => generateInvoicePDF(inv)} className="flex items-center gap-1 text-[10px] tracking-wider uppercase text-wine hover:underline"><Download size={12} /> PDF</button>
                      <button onClick={() => openEdit(inv)} className="text-charcoal/40 hover:text-wine transition-colors" aria-label="Edit invoice"><Pencil size={14} /></button>
                      <button onClick={() => setDeleting(inv)} className="text-charcoal/40 hover:text-red-600 transition-colors" aria-label="Delete invoice"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] tracking-[0.2em] uppercase text-charcoal/40 mb-3">Pending Orders</p>
      <div className="bg-white border border-gold/20 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gold/20 bg-ivory">
              <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left">Order ID</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left">Customer</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-right">Total</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {orders.filter(o => !invoicedOrderIds.has(o.order_id)).map(order => (
              <tr key={order.id} className="border-b border-gold/10 hover:bg-ivory/50 transition-colors">
                <td className="py-3 px-4"><p className="text-xs font-mono">{order.order_id}</p></td>
                <td className="py-3 px-4"><p className="text-sm">{order.full_name}</p></td>
                <td className="py-3 px-4 text-right"><span className="text-sm font-mono">৳{(order.total || 0).toLocaleString()}</span></td>
                <td className="py-3 px-4">
                  <button onClick={() => handleGenerate(order)} disabled={generating === order.id} className="flex items-center gap-1 text-[10px] tracking-wider uppercase bg-wine text-white px-3 py-1.5 hover:bg-wine/90 transition-colors disabled:opacity-50">
                    <FileText size={12} /> {generating === order.id ? '...' : 'Generate'}
                  </button>
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
            <p className="text-[11px] tracking-[0.2em] uppercase text-charcoal/40 mb-1">Edit Invoice</p>
            <p className="text-xs font-mono text-charcoal/40 mb-4">{editing.invoice_number}</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] tracking-[0.1em] uppercase text-charcoal/40">Customer Name</label>
                <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  className="w-full mt-1 border border-gold/30 px-3 py-2 text-sm focus:outline-none focus:border-wine" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.1em] uppercase text-charcoal/40">Mobile</label>
                <input value={form.customer_mobile} onChange={e => setForm(f => ({ ...f, customer_mobile: e.target.value }))}
                  className="w-full mt-1 border border-gold/30 px-3 py-2 text-sm font-mono focus:outline-none focus:border-wine" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.1em] uppercase text-charcoal/40">Total (৳)</label>
                <input type="number" value={form.total} onChange={e => setForm(f => ({ ...f, total: e.target.value }))}
                  className="w-full mt-1 border border-gold/30 px-3 py-2 text-sm font-mono focus:outline-none focus:border-wine" />
              </div>
            </div>
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
            <p className="text-[11px] tracking-[0.2em] uppercase text-charcoal/40 mb-3">Delete Invoice</p>
            <p className="text-sm text-charcoal/70">
              Invoice <span className="font-mono">{deleting.invoice_number}</span> delete korte chao? Eta ferot ana jabe na.
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
