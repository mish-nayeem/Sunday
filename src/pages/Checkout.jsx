import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { Truck, ShieldCheck, ArrowLeft, Copy, Check } from 'lucide-react';
import { getCart, clearCart } from '@/lib/cartStore';
import { useAuth } from '@/lib/AuthContext';

const districts = [
  'Dhaka', 'Chittagong', 'Rajshahi', 'Khulna', 'Sylhet', 'Rangpur', 'Barisal', 'Mymensingh',
  'Comilla', 'Gazipur', 'Narayanganj', 'Cox\'s Bazar', 'Jessore', 'Bogra', 'Dinajpur',
];

// TODO: put your real bKash merchant/personal number here
const BKASH_NUMBER = '01629178834';

const SHIPPING_METHODS = [
  { key: 'inside_dhaka', label: 'Inside Dhaka', price: 80 },
  { key: 'outside_dhaka_advance', label: 'Outside Dhaka — Advance Pay', price: 200 },
];

export default function Checkout() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [cart, setCart] = useState(getCart());
  const [form, setForm] = useState({ full_name: '', email: '', mobile: '', address: '', district: '', area: '', notes: '' });
  const [bkashTrxId, setBkashTrxId] = useState('');
  const [numberCopied, setNumberCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (cart.length === 0) {
      navigate('/cart');
    }
  }, [cart.length, navigate]);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  // Shipping method follows the selected district directly — the customer can't
  // pick "Inside Dhaka" pricing while shipping outside Dhaka (or the reverse).
  const shippingMethod = form.district === 'Dhaka' ? 'inside_dhaka' : 'outside_dhaka_advance';
  const selectedMethod = SHIPPING_METHODS.find(m => m.key === shippingMethod);
  const deliveryCharge = form.district ? (selectedMethod?.price || 0) : 0;
  const total = subtotal + deliveryCharge;
  const isAdvancePay = shippingMethod === 'outside_dhaka_advance' && !!form.district;

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

    // Prices are re-verified server-side inside create_order — only product_id,
    // size and quantity are sent. The price/subtotal/total shown on this page
    // are for display only and are never trusted for the actual order.
    const cartItems = cart.map(i => ({
      product_id: i.productId,
      size: i.size,
      quantity: i.quantity,
    }));

    const { data: result, error: orderError } = await supabase.rpc('create_order', {
      p_full_name: form.full_name,
      p_email: form.email,
      p_mobile: form.mobile,
      p_address: form.address,
      p_district: form.district,
      p_area: form.area,
      p_notes: form.notes,
      p_items: cartItems,
      p_payment_method: isAdvancePay ? 'bkash_advance' : 'cod',
      p_bkash_transaction_id: isAdvancePay ? bkashTrxId.trim() : null,
    });

    if (orderError || !result?.[0]) {
      console.error('Order creation failed:', orderError);
      setSubmitting(false);
      return;
    }

    const oid = result[0].order_id;

    // Stock is NOT decremented here anymore — it only decrements once the order
    // reaches "Delivered" status (handled in AdminOrders.jsx), so cancelled/returned
    // orders never touch inventory in the first place.

    // Notify the shop owner on Telegram instantly — doesn't block the order,
    // failure here is only logged.
    try {
      await supabase.functions.invoke('notify-telegram-order', {
        body: {
          order_id: oid,
          full_name: form.full_name,
          mobile: form.mobile,
          area: form.area,
          district: form.district,
          items: cart.map(i => ({ name: i.name, size: i.size, quantity: i.quantity, price: i.price })),
          subtotal: result[0].subtotal,
          delivery_charge: result[0].delivery_charge,
          total: result[0].total,
          payment_method: isAdvancePay ? 'bkash_advance' : 'cod',
          bkash_transaction_id: isAdvancePay ? bkashTrxId.trim() : null,
        },
      });
    } catch (e) {
      console.error('Telegram notification failed:', e);
    }

    // Send confirmation email + PDF invoice via Brevo (only fires if customer gave an email).
    // Awaited (not fire-and-forget): a full page navigation right after firing this off
    // can abort the in-flight request before it reaches Supabase, so we wait for it here.
    // Still never blocks the order itself — a failure here is only logged, not thrown.
    if (form.email) {
      try {
        await supabase.functions.invoke('send-order-confirmation', { body: { order_id: oid } });
      } catch (e) {
        console.error('Order confirmation email failed:', e);
      }
    }

    clearCart();
    navigate(`/order-confirmation/${oid}`);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-10 md:py-16">
        <Link to="/cart" className="inline-flex items-center gap-2 text-[11px] tracking-wide uppercase text-charcoal/50 hover:text-charcoal mb-8 transition-colors">
          <ArrowLeft size={14} /> Back to Bag
        </Link>

        {/* Brand mark — replaces express checkout */}
        <div className="text-center mb-10">
          <p className="text-xl md:text-2xl font-bold tracking-wide">SUNDAY</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-16">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <p className="text-[11px] tracking-wide uppercase font-medium">Billing Information</p>
              {!isAuthenticated && (
                <p className="text-xs text-charcoal/60">
                  Returning customer?{' '}
                  <Link to="/login" className="text-obsidian underline hover:text-sand transition-colors">
                    Login
                  </Link>
                </p>
              )}
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="text-[11px] tracking-wide uppercase font-medium block mb-2">Full Name *</label>
                <input
                  type="text" required value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-white outline-none focus:border-[#FF7254] focus:ring-2 focus:ring-[#FF7254]/20 transition-colors rounded-xl shadow-sm"
                />
              </div>
              <div>
                <label className="text-[11px] tracking-wide uppercase font-medium block mb-2">Mobile Number *</label>
                <input
                  type="tel" required value={form.mobile}
                  onChange={e => setForm({ ...form, mobile: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-white outline-none focus:border-[#FF7254] focus:ring-2 focus:ring-[#FF7254]/20 transition-colors rounded-xl shadow-sm placeholder:text-charcoal/30"
                />
              </div>
              <div>
                <label className="text-[11px] tracking-wide uppercase font-medium block mb-2">Email *</label>
                <input
                  type="email" required value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-white outline-none focus:border-[#FF7254] focus:ring-2 focus:ring-[#FF7254]/20 transition-colors rounded-xl shadow-sm placeholder:text-charcoal/30"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-[11px] tracking-wide uppercase font-medium block mb-2">District *</label>
                  <select
                    required value={form.district}
                    onChange={e => setForm({ ...form, district: e.target.value })}
                    className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-white outline-none focus:border-[#FF7254] focus:ring-2 focus:ring-[#FF7254]/20 transition-colors rounded-xl shadow-sm"
                  >
                    <option value="">Select District</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] tracking-wide uppercase font-medium block mb-2">Area *</label>
                  <input
                    type="text" required value={form.area}
                    onChange={e => setForm({ ...form, area: e.target.value })}
                    className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-white outline-none focus:border-[#FF7254] focus:ring-2 focus:ring-[#FF7254]/20 transition-colors rounded-xl shadow-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] tracking-wide uppercase font-medium block mb-2">Full Address *</label>
                <textarea
                  required value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-white outline-none focus:border-[#FF7254] focus:ring-2 focus:ring-[#FF7254]/20 transition-colors rounded-xl shadow-sm resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] tracking-wide uppercase font-medium block mb-2">Notes (Optional)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Any special instructions..."
                  className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-white outline-none focus:border-[#FF7254] focus:ring-2 focus:ring-[#FF7254]/20 transition-colors rounded-xl shadow-sm resize-none placeholder:text-charcoal/30"
                />
              </div>

              {/* Shipping method — auto-determined by district, not manually selectable */}
              {form.district && (
                <div className="border border-charcoal/20 px-4 py-3 flex items-center justify-between rounded-xl shadow-sm bg-white">
                  <div>
                    <p className="text-[11px] tracking-wide uppercase font-medium">{selectedMethod?.label}</p>
                    <p className="text-xs text-charcoal/50 mt-0.5">
                      {isAdvancePay ? 'bKash advance payment required' : 'Cash on delivery'}
                    </p>
                  </div>
                  <span className="text-sm font-mono">৳{deliveryCharge}.00</span>
                </div>
              )}

              {/* bKash advance payment section — only for Outside Dhaka */}
              {isAdvancePay && (
                <div className="border border-charcoal/20 p-5 rounded-xl shadow-sm bg-white">
                  <p className="text-[11px] tracking-wide uppercase font-medium mb-4">bKash Payment</p>

                  <div className="flex items-center justify-between border border-charcoal/15 px-4 py-3 mb-4 rounded-xl bg-white">
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
                    <li>Send ৳{deliveryCharge}.00 to the number above</li>
                    <li>Enter the Transaction ID you receive by SMS below</li>
                  </ul>

                  <label className="text-[11px] tracking-wide uppercase font-medium block mb-2">Transaction ID *</label>
                  <input
                    type="text" required={isAdvancePay} value={bkashTrxId}
                    onChange={e => setBkashTrxId(e.target.value)}
                    placeholder="TRXID (e.g., K8H7G6F5D4)"
                    className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-white outline-none focus:border-[#FF7254] focus:ring-2 focus:ring-[#FF7254]/20 transition-colors rounded-xl shadow-sm placeholder:text-charcoal/30"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#FFFBEA] text-black font-semibold text-base tracking-wide uppercase py-4 rounded-xl shadow-sm border border-black/10 hover:bg-[#FFF3D0] transition-colors disabled:opacity-50"
              >
                {submitting ? 'Placing Order...' : 'Confirm Order'}
              </button>
            </form>
          </div>

          {/* Summary */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="bg-white rounded-2xl shadow-lg border border-black/5 p-6 md:p-8">
              <h3 className="text-[11px] tracking-wide uppercase font-semibold mb-6 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF7254]" />
                Order Summary
              </h3>
              <div className="space-y-3 mb-6">
                {cart.map(item => (
                  <div key={`${item.productId}-${item.size}`} className="flex justify-between items-center text-sm py-1">
                    <span className="text-charcoal/70">{item.name} <span className="text-charcoal/40">× {item.quantity}</span></span>
                    <span className="font-mono font-medium">৳{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="h-px bg-black/10 mb-4" />
              <div className="flex justify-between mb-2.5">
                <span className="text-sm text-charcoal/60">Subtotal</span>
                <span className="text-sm font-mono">৳{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-4">
                <span className="text-sm text-charcoal/60">Shipping</span>
                <span className="text-sm font-mono">{deliveryCharge ? `৳${deliveryCharge}` : 'Free'}</span>
              </div>

              <div className="flex justify-between items-center bg-[#FFFBEA] rounded-xl px-4 py-4 mb-6">
                <span className="font-semibold text-black">Total</span>
                <span className="text-xl font-mono font-bold text-black">৳{total.toLocaleString()}</span>
              </div>

              {selectedMethod && (
                <div className="bg-[#FFF0EB] rounded-xl p-4 flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-[#FF7254]/15 flex items-center justify-center shrink-0">
                    <Truck size={16} strokeWidth={2} className="text-[#FF7254]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-black">{selectedMethod?.label}</p>
                    <p className="text-xs text-charcoal/50">
                      {isAdvancePay ? 'Advance payment via bKash required' : 'Pay when you receive your order'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-charcoal/40 px-1">
                <ShieldCheck size={14} className="text-[#418BE0]" />
                <span>Your information is secure and never shared</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
