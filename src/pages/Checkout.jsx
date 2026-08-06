import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { Truck, ShieldCheck, ArrowLeft, Copy, Check } from 'lucide-react';
import { getCart, clearCart } from '@/lib/cartStore';

const districts = [
  'Dhaka', 'Chittagong', 'Rajshahi', 'Khulna', 'Sylhet', 'Rangpur', 'Barisal', 'Mymensingh',
  'Comilla', 'Gazipur', 'Narayanganj', 'Cox\'s Bazar', 'Jessore', 'Bogra', 'Dinajpur',
];

// TODO: put your real bKash merchant/personal number here
const BKASH_NUMBER = '01629178834';

const SHIPPING_METHODS = [
  { key: 'inside_dhaka', label: 'Inside Dhaka', price: 80 },
  { key: 'outside_dhaka_advance', label: 'Outside Dhaka — Advance Pay', price: 120 },
];

// Advance amount collected via bKash for Outside Dhaka orders.
// Remaining due on delivery = subtotal + delivery charge (outside Dhaka) − advance pay.
const ADVANCE_AMOUNT = 200;

export default function Checkout() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(getCart());
  const [form, setForm] = useState({ full_name: '', email: '', mobile: '', address: '', district: '', area: '', notes: '' });
  const [shippingMethod, setShippingMethod] = useState('inside_dhaka');
  const [bkashTrxId, setBkashTrxId] = useState('');
  const [numberCopied, setNumberCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (cart.length === 0) {
      navigate('/cart');
    }
  }, [cart.length, navigate]);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const selectedMethod = SHIPPING_METHODS.find(m => m.key === shippingMethod);
  const deliveryCharge = selectedMethod?.price || 0;
  const total = subtotal + deliveryCharge;
  const isAdvancePay = shippingMethod === 'outside_dhaka_advance';
  const advanceAmount = isAdvancePay ? ADVANCE_AMOUNT : 0;
  // Due on delivery = product price + delivery charge (outside Dhaka) − advance pay
  const dueOnDelivery = total - advanceAmount;

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(BKASH_NUMBER);
      setNumberCopied(true);
      setTimeout(() => setNumberCopied(false), 2000);
    } catch (e) { /* clipboard not available */ }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isAdvancePay && !bkashTrxId.trim()) return;
    setSubmitting(true);

    const oid = 'SND-' + Date.now().toString(36).toUpperCase();
    const invoiceNumber = `SND-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const orderItems = cart.map(i => ({
      product_id: i.productId,
      name: i.name,
      size: i.size,
      quantity: i.quantity,
      price: i.price,
      image: i.image,
      sku: i.sku,
    }));

    const { error: orderError } = await supabase.from('orders').insert({
      order_id: oid,
      full_name: form.full_name,
      email: form.email,
      mobile: form.mobile,
      address: form.address,
      district: form.district,
      area: form.area,
      notes: form.notes,
      items: orderItems,
      subtotal,
      delivery_charge: deliveryCharge,
      total,
      payment_method: isAdvancePay ? 'bkash_advance' : 'cod',
      payment_status: isAdvancePay ? 'advance_paid' : 'unpaid',
      bkash_transaction_id: isAdvancePay ? bkashTrxId.trim() : null,
      shipping_method: shippingMethod,
      invoice_number: invoiceNumber,
      status: 'pending',
    });

    if (orderError) {
      console.error('Order creation failed:', orderError);
      setSubmitting(false);
      return;
    }

    // Auto-generate invoice
    try {
      await supabase.from('invoices').insert({
        invoice_number: invoiceNumber,
        order_id: oid,
        customer_name: form.full_name,
        customer_mobile: form.mobile,
        customer_address: `${form.address}, ${form.area}, ${form.district}`,
        items: cart.map(i => ({ name: i.name, size: i.size, quantity: i.quantity, price: i.price })),
        subtotal,
        delivery_charge: deliveryCharge,
        total,
        issue_date: new Date().toISOString().split('T')[0],
        status: 'issued',
      });
    } catch (e) { console.error('Invoice creation failed:', e); }

    // Decrement stock on each product
    try {
      const productIds = [...new Set(cart.map(i => i.productId))];
      const { data: products } = await supabase.from('products').select('*').in('id', productIds);
      const stockUpdates = (products || []).map(p => {
        const cartItems = cart.filter(i => i.productId === p.id);
        const qtySold = cartItems.reduce((s, i) => s + i.quantity, 0);
        const newQuantity = Math.max(0, (p.quantity || 0) - qtySold);
        const newSizeStock = { ...(p.size_stock || {}) };
        cartItems.forEach(item => {
          if (newSizeStock[item.size] !== undefined) {
            newSizeStock[item.size] = Math.max(0, newSizeStock[item.size] - item.quantity);
          }
        });
        return { id: p.id, quantity: newQuantity, size_stock: newSizeStock };
      });
      await Promise.all(
        stockUpdates.map(u =>
          supabase.from('products').update({ quantity: u.quantity, size_stock: u.size_stock }).eq('id', u.id)
        )
      );
    } catch (e) { console.error('Stock update failed:', e); }

    clearCart();
    window.location.href = `/order-confirmation/${oid}`;
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-10 md:py-16">
        <Link to="/cart" className="inline-flex items-center gap-2 text-[11px] tracking-[0.15em] uppercase text-charcoal/50 hover:text-charcoal mb-8 transition-colors">
          <ArrowLeft size={14} /> Back to Bag
        </Link>

        {/* Brand mark — replaces express checkout */}
        <div className="text-center mb-10">
          <p className="text-xl md:text-2xl font-bold tracking-[0.15em]">SUNDAY</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-16">
          {/* Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Full Name *</label>
                <input
                  type="text" required value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  className="w-full border border-charcoal/20 rounded-lg px-4 py-2.5 text-sm bg-transparent outline-none focus:border-charcoal transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Mobile Number *</label>
                <input
                  type="tel" required value={form.mobile}
                  onChange={e => setForm({ ...form, mobile: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  className="w-full border border-charcoal/20 rounded-lg px-4 py-2.5 text-sm bg-transparent outline-none focus:border-charcoal transition-colors placeholder:text-charcoal/30"
                />
              </div>
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Email *</label>
                <input
                  type="email" required value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full border border-charcoal/20 rounded-lg px-4 py-2.5 text-sm bg-transparent outline-none focus:border-charcoal transition-colors placeholder:text-charcoal/30"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">District *</label>
                  <select
                    required value={form.district}
                    onChange={e => setForm({ ...form, district: e.target.value })}
                    className="w-full border border-charcoal/20 rounded-lg px-4 py-2.5 text-sm bg-transparent outline-none focus:border-charcoal transition-colors"
                  >
                    <option value="">Select District</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Area *</label>
                  <input
                    type="text" required value={form.area}
                    onChange={e => setForm({ ...form, area: e.target.value })}
                    className="w-full border border-charcoal/20 rounded-lg px-4 py-2.5 text-sm bg-transparent outline-none focus:border-charcoal transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Full Address *</label>
                <textarea
                  required value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  className="w-full border border-charcoal/20 rounded-lg px-4 py-2.5 text-sm bg-transparent outline-none focus:border-charcoal transition-colors resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Notes (Optional)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Any special instructions..."
                  className="w-full border border-charcoal/20 rounded-lg px-4 py-2.5 text-sm bg-transparent outline-none focus:border-charcoal transition-colors resize-none placeholder:text-charcoal/30"
                />
              </div>

              {/* Shipping method */}
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-3">Shipping Method *</label>
                <div className="space-y-2">
                  {SHIPPING_METHODS.map(m => (
                    <label
                      key={m.key}
                      className={`flex items-center justify-between border rounded-lg px-4 py-2.5 cursor-pointer transition-colors ${
                        shippingMethod === m.key ? 'border-charcoal' : 'border-charcoal/20'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="shipping_method"
                          checked={shippingMethod === m.key}
                          onChange={() => setShippingMethod(m.key)}
                        />
                        <span className="text-sm">{m.label}</span>
                      </span>
                      <span className="text-sm font-mono">৳{m.price}.00</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* bKash advance payment section — only for Outside Dhaka */}
              {isAdvancePay && (
                <div className="border border-charcoal/20 rounded-lg p-5">
                  <p className="text-[11px] tracking-[0.2em] uppercase font-medium mb-4">bKash Payment</p>

                  <div className="flex items-center justify-between border border-charcoal/15 rounded-lg px-4 py-2.5 mb-4">
                    <span className="text-sm font-medium">bKash Number</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono">{BKASH_NUMBER}</span>
                      <button type="button" onClick={handleCopyNumber} className="text-charcoal/50 hover:text-charcoal transition-colors">
                        {numberCopied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <ul className="text-xs text-charcoal/60 space-y-1.5 mb-4 list-disc list-inside">
                    <li>Dial *247# or open your bKash app</li>
                    <li>Select "Send Money"</li>
                    <li>Send ৳{ADVANCE_AMOUNT}.00 (advance) to the number above</li>
                    <li>Enter the Transaction ID you receive by SMS below</li>
                  </ul>

                  <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Transaction ID *</label>
                  <input
                    type="text" required={isAdvancePay} value={bkashTrxId}
                    onChange={e => setBkashTrxId(e.target.value)}
                    placeholder="TRXID (e.g., K8H7G6F5D4)"
                    className="w-full border border-charcoal/20 rounded-lg px-4 py-2.5 text-sm bg-transparent outline-none focus:border-charcoal transition-colors placeholder:text-charcoal/30"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-wine text-white text-[11px] tracking-[0.2em] uppercase py-4 hover:bg-wine/90 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Placing Order...' : 'Confirm Order'}
              </button>
            </form>
          </div>

          {/* Summary */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="bg-ivory rounded-lg p-6 md:p-8">
              <h3 className="text-[11px] tracking-[0.2em] uppercase font-medium mb-6">Order Summary</h3>
              <div className="space-y-3 mb-6">
                {cart.map(item => (
                  <div key={`${item.productId}-${item.size}`} className="flex justify-between text-sm">
                    <span className="text-charcoal/60">{item.name} × {item.quantity}</span>
                    <span className="font-mono">৳{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="h-px bg-gold/20 mb-4" />
              <div className="flex justify-between mb-2">
                <span className="text-sm">Subtotal</span>
                <span className="text-sm font-mono">৳{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-4">
                <span className="text-sm">Shipping</span>
                <span className="text-sm font-mono">৳{deliveryCharge}</span>
              </div>
              <div className="h-px bg-gold/20 mb-4" />
              <div className="flex justify-between">
                <span className="font-medium">Total</span>
                <span className="text-lg font-mono font-medium">৳{total.toLocaleString()}</span>
              </div>

              {isAdvancePay && (
                <div className="mt-4 pt-4 border-t border-dashed border-charcoal/20 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-charcoal/60">Advance (bKash, now)</span>
                    <span className="font-mono">৳{advanceAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-charcoal/60">Due on Delivery (COD)</span>
                    <span className="font-mono font-medium">৳{dueOnDelivery.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="mt-6 bg-wine/5 rounded-lg p-4 flex items-center gap-3">
                <Truck size={18} strokeWidth={1} className="text-wine" />
                <div>
                  <p className="text-sm font-medium">{selectedMethod?.label}</p>
                  <p className="text-xs text-charcoal/50">
                    {isAdvancePay ? 'Advance payment via bKash required' : 'Pay when you receive your order'}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-charcoal/40">
                <ShieldCheck size={14} className="text-gold" />
                <span>Your information is secure and never shared</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
