import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { Truck, ShieldCheck, ArrowLeft } from 'lucide-react';
import { getCart, clearCart } from '@/lib/cartStore';

const districts = [
  'Dhaka', 'Chittagong', 'Rajshahi', 'Khulna', 'Sylhet', 'Rangpur', 'Barisal', 'Mymensingh',
  'Comilla', 'Gazipur', 'Narayanganj', 'Cox\'s Bazar', 'Jessore', 'Bogra', 'Dinajpur',
];

export default function Checkout() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(getCart());
  const [form, setForm] = useState({ full_name: '', email: '', mobile: '', address: '', district: '', area: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (cart.length === 0) {
      navigate('/cart');
    }
  }, [cart.length, navigate]);

  useEffect(() => {
    supabase.from('settings').select('*').limit(1).then(({ data }) => {
      if (data && data.length > 0) setSettings(data[0]);
    });
  }, []);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryCharge = form.district === 'Dhaka' ? (settings?.dhaka_delivery_charge ?? 60) : form.district ? (settings?.outside_dhaka_delivery_charge ?? 120) : 0;
  const total = subtotal + deliveryCharge;

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      payment_method: 'cod',
      payment_status: 'unpaid',
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

    // NOTE: Base44's email notifications (admin + customer) were removed here.
    // Supabase doesn't send arbitrary transactional emails on its own — the order
    // still shows up instantly in Admin > Orders via realtime, and the customer
    // is offered a "Confirm via WhatsApp" button on the confirmation page.
    // If you want email back, see the migration guide, section 7 (Resend + Edge Function).

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

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <p className="text-[11px] tracking-[0.3em] uppercase text-gold mb-2">Almost There</p>
          <h1 className="text-2xl md:text-4xl font-heading font-light tracking-wide">Checkout</h1>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-16">
          {/* Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Full Name *</label>
                <input
                  type="text" required value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Mobile Number *</label>
                <input
                  type="tel" required value={form.mobile}
                  onChange={e => setForm({ ...form, mobile: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors placeholder:text-charcoal/30"
                />
              </div>
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Email (Optional — for order confirmation)</label>
                <input
                  type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors placeholder:text-charcoal/30"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">District *</label>
                  <select
                    required value={form.district}
                    onChange={e => setForm({ ...form, district: e.target.value })}
                    className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors"
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
                    className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Full Address *</label>
                <textarea
                  required value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Notes (Optional)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Any special instructions..."
                  className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors resize-none placeholder:text-charcoal/30"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-wine text-white text-[11px] tracking-[0.2em] uppercase py-4 hover:bg-wine/90 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Placing Order...' : 'Confirm Order — Cash on Delivery'}
              </button>
            </form>
          </div>

          {/* Summary */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="bg-ivory p-6 md:p-8">
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
                <span className="text-sm">Delivery Charge</span>
                <span className="text-sm font-mono">
                  {deliveryCharge > 0 ? `৳${deliveryCharge}` : 'Select district'}
                </span>
              </div>
              <div className="h-px bg-gold/20 mb-4" />
              <div className="flex justify-between">
                <span className="font-medium">Total</span>
                <span className="text-lg font-mono font-medium">৳{total.toLocaleString()}</span>
              </div>

              <div className="mt-6 bg-wine/5 p-4 flex items-center gap-3">
                <Truck size={18} strokeWidth={1} className="text-wine" />
                <div>
                  <p className="text-sm font-medium">Cash on Delivery</p>
                  <p className="text-xs text-charcoal/50">Pay when you receive your order</p>
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