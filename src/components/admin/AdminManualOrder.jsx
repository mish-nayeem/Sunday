import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react';

const districts = [
  'Dhaka', 'Chittagong', 'Rajshahi', 'Khulna', 'Sylhet', 'Rangpur', 'Barisal', 'Mymensingh',
  'Comilla', 'Gazipur', 'Narayanganj', 'Cox\'s Bazar', 'Jessore', 'Bogra', 'Dinajpur',
];

const DELIVERY_CHARGES = { inside_dhaka: 80, outside_dhaka_advance: 200 };

export default function AdminManualOrder() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    full_name: '', mobile: '', email: '', address: '', district: '', area: '', notes: '',
    payment_method: 'cod', bkash_transaction_id: '', delivery_charge_override: '',
  });
  const [items, setItems] = useState([]);
  const [itemDraft, setItemDraft] = useState({ product_id: '', size: '', quantity: 1, price: '' });
  const [submitting, setSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('products').select('*').order('name').then(({ data }) => setProducts(data || []));
  }, []);

  const selectedProduct = products.find(p => p.id === itemDraft.product_id);
  const shippingMethod = form.district === 'Dhaka' ? 'inside_dhaka' : 'outside_dhaka_advance';
  const autoDeliveryCharge = form.district ? DELIVERY_CHARGES[shippingMethod] : 0;
  const deliveryCharge = form.delivery_charge_override !== ''
    ? Number(form.delivery_charge_override)
    : autoDeliveryCharge;

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = subtotal + deliveryCharge;

  const handleProductSelect = (productId) => {
    const p = products.find(pr => pr.id === productId);
    setItemDraft({ product_id: productId, size: p?.sizes?.[0] || '', quantity: 1, price: p?.price || '' });
  };

  const addItem = () => {
    if (!selectedProduct || !itemDraft.size || !itemDraft.quantity || !itemDraft.price) return;
    setItems(prev => [...prev, {
      product_id: selectedProduct.id,
      name: selectedProduct.name,
      size: itemDraft.size,
      quantity: Number(itemDraft.quantity),
      price: Number(itemDraft.price),
      image: selectedProduct.images?.[0] || '',
      sku: selectedProduct.sku || '',
    }]);
    setItemDraft({ product_id: '', size: '', quantity: 1, price: '' });
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const resetForm = () => {
    setForm({ full_name: '', mobile: '', email: '', address: '', district: '', area: '', notes: '', payment_method: 'cod', bkash_transaction_id: '', delivery_charge_override: '' });
    setItems([]);
    setItemDraft({ product_id: '', size: '', quantity: 1, price: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (items.length === 0) {
      setError('Add at least one item to the order.');
      return;
    }
    setSubmitting(true);

    const oid = 'SND-' + Date.now().toString(36).toUpperCase();
    const invoiceNumber = `SND-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const isAdvancePay = form.payment_method === 'bkash_advance';

    const { error: orderError } = await supabase.from('orders').insert({
      order_id: oid,
      full_name: form.full_name,
      email: form.email || null,
      mobile: form.mobile,
      address: form.address,
      district: form.district,
      area: form.area,
      notes: form.notes,
      admin_notes: 'Manual entry — Instagram/Messenger order',
      items,
      subtotal,
      delivery_charge: deliveryCharge,
      total,
      payment_method: form.payment_method,
      payment_status: isAdvancePay ? 'advance_paid' : 'unpaid',
      bkash_transaction_id: isAdvancePay ? form.bkash_transaction_id.trim() : null,
      shipping_method: shippingMethod,
      invoice_number: invoiceNumber,
      status: 'confirmed',
    });

    if (orderError) {
      setError(`Order creation failed: ${orderError.message}`);
      setSubmitting(false);
      return;
    }

    try {
      await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        order_id: oid,
        customer_name: form.full_name,
        customer_mobile: form.mobile,
        customer_address: `${form.address}, ${form.area}, ${form.district}`,
        items: items.map(i => ({ name: i.name, size: i.size, quantity: i.quantity, price: i.price })),
        subtotal,
        delivery_charge: deliveryCharge,
        total,
        issue_date: new Date().toISOString().split('T')[0],
        status: 'issued',
      });
    } catch (e) { console.error('Invoice creation failed:', e); }

    // Stock is NOT decremented here anymore — it only decrements once the order
    // reaches "Delivered" status (handled in AdminOrders.jsx).

    if (form.email) {
      try {
        await supabase.functions.invoke('send-order-confirmation', { body: { order_id: oid } });
      } catch (e) { console.error('Order confirmation email failed:', e); }
    }

    setSuccessOrder({ order_id: oid, invoice_number: invoiceNumber, total });
    resetForm();
    setSubmitting(false);
  };

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-obsidian/60 mb-6">
        Use this for orders that come in through Instagram or Messenger DMs — it creates the
        order, invoice, and stock update exactly like a normal checkout, and emails the
        customer a confirmation + PDF invoice if you give an email address.
      </p>

      {successOrder && (
        <div className="bg-green-50 border border-green-200 p-4 mb-6 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-green-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-800">Order created — {successOrder.order_id}</p>
            <p className="text-xs text-green-700 mt-0.5">
              Invoice {successOrder.invoice_number} · Total ৳{successOrder.total.toLocaleString()}
            </p>
          </div>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 p-4 mb-6 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-sand/30 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] tracking-wider uppercase text-obsidian/50 block mb-1">Full Name *</label>
            <input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
              className="w-full border border-sand/40 px-3 py-2 text-sm outline-none focus:border-wine" />
          </div>
          <div>
            <label className="text-[10px] tracking-wider uppercase text-obsidian/50 block mb-1">Mobile *</label>
            <input required value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })}
              placeholder="01XXXXXXXXX"
              className="w-full border border-sand/40 px-3 py-2 text-sm outline-none focus:border-wine" />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] tracking-wider uppercase text-obsidian/50 block mb-1">
              Email <span className="text-obsidian/30 normal-case">(optional — leave blank if the customer only messaged you)</span>
            </label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full border border-sand/40 px-3 py-2 text-sm outline-none focus:border-wine" />
          </div>
          <div>
            <label className="text-[10px] tracking-wider uppercase text-obsidian/50 block mb-1">District *</label>
            <select required value={form.district} onChange={e => setForm({ ...form, district: e.target.value })}
              className="w-full border border-sand/40 px-3 py-2 text-sm outline-none focus:border-wine">
              <option value="">Select District</option>
              {districts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] tracking-wider uppercase text-obsidian/50 block mb-1">Area *</label>
            <input required value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}
              className="w-full border border-sand/40 px-3 py-2 text-sm outline-none focus:border-wine" />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] tracking-wider uppercase text-obsidian/50 block mb-1">Full Address *</label>
            <textarea required rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
              className="w-full border border-sand/40 px-3 py-2 text-sm outline-none focus:border-wine resize-none" />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] tracking-wider uppercase text-obsidian/50 block mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. Ordered via Instagram DM on Aug 8"
              className="w-full border border-sand/40 px-3 py-2 text-sm outline-none focus:border-wine resize-none" />
          </div>
        </div>

        {/* Items */}
        <div>
          <label className="text-[10px] tracking-wider uppercase text-obsidian/50 block mb-2">Order Items *</label>
          {items.length > 0 && (
            <div className="mb-3 border border-sand/30">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm border-b border-sand/20 last:border-0">
                  <span>{item.name} ({item.size}) × {item.quantity}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono">৳{(item.price * item.quantity).toLocaleString()}</span>
                    <button type="button" onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end bg-mist/50 p-3">
            <div className="col-span-2 md:col-span-2">
              <label className="text-[9px] tracking-wider uppercase text-obsidian/40 block mb-1">Product</label>
              <select value={itemDraft.product_id} onChange={e => handleProductSelect(e.target.value)}
                className="w-full border border-sand/40 px-2 py-1.5 text-xs outline-none focus:border-wine">
                <option value="">Select product</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] tracking-wider uppercase text-obsidian/40 block mb-1">Size</label>
              <select value={itemDraft.size} onChange={e => setItemDraft({ ...itemDraft, size: e.target.value })}
                disabled={!selectedProduct}
                className="w-full border border-sand/40 px-2 py-1.5 text-xs outline-none focus:border-wine disabled:opacity-40">
                {(selectedProduct?.sizes || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] tracking-wider uppercase text-obsidian/40 block mb-1">Qty</label>
              <input type="number" min="1" value={itemDraft.quantity}
                onChange={e => setItemDraft({ ...itemDraft, quantity: e.target.value })}
                className="w-full border border-sand/40 px-2 py-1.5 text-xs outline-none focus:border-wine" />
            </div>
            <div className="flex gap-1">
              <div className="flex-1">
                <label className="text-[9px] tracking-wider uppercase text-obsidian/40 block mb-1">Price (৳)</label>
                <input type="number" value={itemDraft.price}
                  onChange={e => setItemDraft({ ...itemDraft, price: e.target.value })}
                  className="w-full border border-sand/40 px-2 py-1.5 text-xs outline-none focus:border-wine" />
              </div>
              <button type="button" onClick={addItem} className="bg-wine text-white px-2 py-1.5 shrink-0 self-end">
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Payment */}
        <div>
          <label className="text-[10px] tracking-wider uppercase text-obsidian/50 block mb-2">Payment Method *</label>
          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={form.payment_method === 'cod'} onChange={() => setForm({ ...form, payment_method: 'cod' })} />
              Cash on Delivery
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={form.payment_method === 'bkash_advance'} onChange={() => setForm({ ...form, payment_method: 'bkash_advance' })} />
              bKash (Advance Paid)
            </label>
          </div>
          {form.payment_method === 'bkash_advance' && (
            <input value={form.bkash_transaction_id} onChange={e => setForm({ ...form, bkash_transaction_id: e.target.value })}
              placeholder="bKash Transaction ID"
              className="w-full border border-sand/40 px-3 py-2 text-sm outline-none focus:border-wine" />
          )}
        </div>

        {/* Delivery charge override + totals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] tracking-wider uppercase text-obsidian/50 block mb-1">
              Delivery Charge (৳) <span className="text-obsidian/30 normal-case">— auto: ৳{autoDeliveryCharge}, override if negotiated</span>
            </label>
            <input type="number" value={form.delivery_charge_override}
              onChange={e => setForm({ ...form, delivery_charge_override: e.target.value })}
              placeholder={String(autoDeliveryCharge)}
              className="w-full border border-sand/40 px-3 py-2 text-sm outline-none focus:border-wine" />
          </div>
          <div className="bg-mist/50 p-3 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">৳{subtotal.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Delivery</span><span className="font-mono">৳{deliveryCharge.toLocaleString()}</span></div>
            <div className="flex justify-between font-medium mt-1 pt-1 border-t border-sand/30"><span>Total</span><span className="font-mono">৳{total.toLocaleString()}</span></div>
          </div>
        </div>

        <button type="submit" disabled={submitting}
          className="bg-wine text-white text-[11px] tracking-wider uppercase px-6 py-3 hover:bg-wine/90 transition-colors disabled:opacity-50">
          {submitting ? 'Creating Order...' : 'Create Order'}
        </button>
      </form>
    </div>
  );
}
