import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { Truck, ShieldCheck, ArrowLeft, Copy, Check } from 'lucide-react';
import { getCart, clearCart, subscribeCart, updateCartItem, changeCartItemSize, removeFromCart } from '@/lib/cartStore';
import { imgUrl } from '@/lib/storage';
import { isSizeAvailable } from '@/lib/catalog';
import { useAuth } from '@/lib/AuthContext';
import { checkCoupon } from '@/admin/lib/coupons.js';
import { getAttribution } from '@/lib/attribution';
import { saveAbandonedCart, markCartConverted } from '@/lib/abandonedCart';
import { fetchLiveSales } from '@/admin/lib/sales.js';
import { withSale } from '@/lib/pricing';

// create_order's tagged errors, said plainly.
function orderErrorMessage(error) {
  const raw = error?.message || '';
  let m;
  if ((m = raw.match(/SOLD_OUT:(.*):(.*)/))) return `${m[1]} in size ${m[2]} has just sold out. Remove it from your bag to continue.`;
  if ((m = raw.match(/UNAVAILABLE:(.*)/))) return `${m[1]} isn’t available yet. Remove it from your bag to continue.`;
  if (raw.includes('RATE_LIMITED')) return 'Too many orders from this connection. Wait a few minutes and try again.';
  if (raw.includes('COUPON_')) return 'That code can’t be used on this order any more. Remove it and try again.';
  return 'The order didn’t go through. Check your details and try again.';
}

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
  const [bag, setBag] = useState(getCart());
  const [catalog, setCatalog] = useState(new Map()); // productId → product (with sale)
  const placed = useRef(false);
  const [form, setForm] = useState({ full_name: '', email: '', mobile: '', address: '', district: '', area: '', notes: '' });
  const [bkashTrxId, setBkashTrxId] = useState('');
  const [numberCopied, setNumberCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null); // { code, discount }
  const [couponError, setCouponError] = useState('');
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  // The summary follows the bag: changing a size or quantity here (or in the
  // bag drawer) updates it.
  useEffect(() => subscribeCart(() => setBag(getCart())), []);

  // Bag prices are refreshed from the catalog and any running sale, so the
  // summary matches what create_order will charge. The products also give
  // each line its sizes and photo.
  useEffect(() => {
    const ids = [...new Set(getCart().map((i) => i.productId))];
    if (!ids.length) return;
    Promise.all([supabase.from('products').select('*').in('id', ids), fetchLiveSales()]).then(([{ data }, sales]) => {
      if (!data) return;
      setCatalog(new Map(data.map((p) => [p.id, withSale(p, sales)])));
    });
  }, []);

  const cart = useMemo(
    () => bag.map((i) => (catalog.has(i.productId) ? { ...i, price: catalog.get(i.productId).price } : i)),
    [bag, catalog]
  );

  useEffect(() => {
    // An empty bag goes back to the bag page — but not right after an order,
    // which empties it on the way to the confirmation.
    if (cart.length === 0 && !placed.current) {
      navigate('/cart');
    }
  }, [cart.length, navigate]);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  // Shipping method follows the selected district directly — the customer can't
  // pick "Inside Dhaka" pricing while shipping outside Dhaka (or the reverse).
  const shippingMethod = form.district === 'Dhaka' ? 'inside_dhaka' : 'outside_dhaka_advance';
  const selectedMethod = SHIPPING_METHODS.find(m => m.key === shippingMethod);
  const deliveryCharge = form.district ? (selectedMethod?.price || 0) : 0;
  const discount = coupon ? Math.min(coupon.discount, subtotal) : 0;
  const total = subtotal - discount + deliveryCharge;

  // A checkout that's never finished shows up in Admin → Orders → Abandoned
  // cart, once there's a name or phone to follow up with.
  useEffect(() => {
    if (!form.full_name.trim() && !form.mobile.trim()) return;
    const t = setTimeout(() => {
      saveAbandonedCart({
        name: form.full_name,
        phone: form.mobile,
        items: cart.map((i) => ({ product_id: i.productId, product_name: i.name, size: i.size, qty: i.quantity, price: i.price })),
        cartValue: subtotal,
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [form.full_name, form.mobile, cart, subtotal]);

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCheckingCoupon(true);
    setCouponError('');
    const { coupon: c, error } = await checkCoupon(couponInput.trim(), subtotal, form.mobile);
    setCheckingCoupon(false);
    if (error) { setCoupon(null); setCouponError(error.replace(/৳ ?/g, 'Tk ')); return; }
    setCoupon(c);
  };
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
    setSubmitError('');
    const utm = getAttribution();

    // Prices are re-verified server-side inside create_order — only product_id,
    // size and quantity are sent. The price/subtotal/total shown on this page
    // are for display only and are never trusted for the actual order.
    const cartItems = cart.map(i => ({
      product_id: i.productId,
      size: i.size,
      quantity: i.quantity,
    }));

    const base = {
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
    };
    let { data: result, error: orderError } = await supabase.rpc('create_order', {
      ...base,
      p_coupon_code: coupon?.code || null,
      p_utm_source: utm.utm_source || null,
      p_utm_medium: utm.utm_medium || null,
      p_utm_campaign: utm.utm_campaign || null,
    });
    // The database not updated yet (no coupon/link parameters): place the
    // order the old way rather than losing it. A coupon can't apply then.
    if (orderError?.code === 'PGRST202' && !coupon) {
      ({ data: result, error: orderError } = await supabase.rpc('create_order', base));
    }

    if (orderError || !result?.[0]) {
      console.error('Order creation failed:', orderError);
      setSubmitError(orderErrorMessage(orderError));
      setSubmitting(false);
      return;
    }

    const oid = result[0].order_id;
    await markCartConverted(oid);

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
          discount,
          coupon_code: coupon?.code || null,
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

    placed.current = true;
    clearCart();
    navigate(`/order-confirmation/${oid}`);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-10 md:py-16">
        <Link to="/cart" className="inline-flex items-center gap-2 text-[13px] text-graphite hover:text-charcoal mb-8 transition-colors">
          <ArrowLeft size={14} /> Back to Bag
        </Link>

        {/* Brand mark — replaces express checkout */}
        <div className="text-center mb-10">
          <h1 className="font-heading text-[32px] md:text-[40px] leading-none">Checkout</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-16">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <p className="text-[13px]">Delivery details</p>
              {!isAuthenticated && (
                <p className="text-xs text-charcoal/60">
                  Returning customer?{' '}
                  <Link to="/login?next=/checkout" className="text-obsidian underline hover:text-graphite transition-colors">
                    Login
                  </Link>
                </p>
              )}
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="text-[13px] block mb-2">Full Name *</label>
                <input
                  type="text" required value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  className="w-full border border-rule px-4 py-3 text-sm bg-white outline-none focus:border-ink transition-colors"
                />
              </div>
              <div>
                <label className="text-[13px] block mb-2">Mobile Number *</label>
                <input
                  type="tel" required value={form.mobile}
                  onChange={e => setForm({ ...form, mobile: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  className="w-full border border-rule px-4 py-3 text-sm bg-white outline-none focus:border-ink transition-colors placeholder:text-charcoal/30"
                />
              </div>
              <div>
                <label className="text-[13px] block mb-2">Email *</label>
                <input
                  type="email" required value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full border border-rule px-4 py-3 text-sm bg-white outline-none focus:border-ink transition-colors placeholder:text-charcoal/30"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-[13px] block mb-2">District *</label>
                  <select
                    required value={form.district}
                    onChange={e => setForm({ ...form, district: e.target.value })}
                    className="w-full border border-rule px-4 py-3 text-sm bg-white outline-none focus:border-ink transition-colors"
                  >
                    <option value="">Select District</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] block mb-2">Area *</label>
                  <input
                    type="text" required value={form.area}
                    onChange={e => setForm({ ...form, area: e.target.value })}
                    className="w-full border border-rule px-4 py-3 text-sm bg-white outline-none focus:border-ink transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-[13px] block mb-2">Full Address *</label>
                <textarea
                  required value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  className="w-full border border-rule px-4 py-3 text-sm bg-white outline-none focus:border-ink transition-colors resize-none"
                />
              </div>
              <div>
                <label className="text-[13px] block mb-2">Notes (Optional)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Any special instructions..."
                  className="w-full border border-rule px-4 py-3 text-sm bg-white outline-none focus:border-ink transition-colors resize-none placeholder:text-charcoal/30"
                />
              </div>

              {/* Shipping method — auto-determined by district, not manually selectable */}
              {form.district && (
                <div className="border border-rule px-4 py-3 flex items-center justify-between  bg-white">
                  <div>
                    <p className="text-[13px]">{selectedMethod?.label}</p>
                    <p className="text-xs text-charcoal/50 mt-0.5">
                      {isAdvancePay ? 'bKash advance payment required' : 'Cash on delivery'}
                    </p>
                  </div>
                  <span className="text-sm font-mono">Tk {deliveryCharge}.00</span>
                </div>
              )}

              {/* bKash advance payment section — only for Outside Dhaka */}
              {isAdvancePay && (
                <div className="border border-rule p-5  bg-white">
                  <p className="text-[13px] mb-4">bKash Payment</p>

                  <div className="flex items-center justify-between border border-rule px-4 py-3 mb-4 bg-white">
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
                    <li>Send Tk {deliveryCharge}.00 to the number above</li>
                    <li>Enter the Transaction ID you receive by SMS below</li>
                  </ul>

                  <label className="text-[13px] block mb-2">Transaction ID *</label>
                  <input
                    type="text" required={isAdvancePay} value={bkashTrxId}
                    onChange={e => setBkashTrxId(e.target.value)}
                    placeholder="TRXID (e.g., K8H7G6F5D4)"
                    className="w-full border border-rule px-4 py-3 text-sm bg-white outline-none focus:border-ink transition-colors placeholder:text-charcoal/30"
                  />
                </div>
              )}

              {submitError && <p className="text-[13px] text-coral" role="alert">{submitError}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 bg-ink text-white text-[13px] hover:bg-ink/85 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Placing Order...' : 'Confirm Order'}
              </button>
            </form>
          </div>

          {/* Summary */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="bg-white border border-rule p-6 md:p-8">
              <h3 className="text-[14px] mb-6 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#000]" />
                Order Summary
              </h3>
              <div className="space-y-3 mb-6">
                {cart.map((item) => {
                  const product = catalog.get(item.productId);
                  const photo = item.image || product?.images?.[0];
                  const sizes = product?.sizes?.length ? product.sizes : [item.size];
                  return (
                    <div key={`${item.productId}-${item.size}`} className="flex gap-3 py-1">
                      <Link to={`/product/${item.productId}`} className="shrink-0 w-14 h-[70px] bg-stone overflow-hidden">
                        {photo && <img src={imgUrl(photo, 140)} alt="" className="w-full h-full object-cover" />}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-3 text-[13px]">
                          <span className="min-w-0 truncate">{item.name}</span>
                          <span className="shrink-0 font-medium">Tk {(item.price * item.quantity).toLocaleString()}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                          {/* Size: another size of the same piece, or more of it. */}
                          <label className="sr-only" htmlFor={`size-${item.productId}-${item.size}`}>Size</label>
                          <select
                            id={`size-${item.productId}-${item.size}`}
                            value={item.size}
                            onChange={(e) => changeCartItemSize(item.productId, item.size, e.target.value)}
                            className="h-8 border border-rule bg-white px-2 pr-6 outline-none focus:border-ink"
                          >
                            {sizes.map((sz) => {
                              const ok = !product || isSizeAvailable(product, sz) || sz === item.size;
                              return <option key={sz} value={sz} disabled={!ok}>Size {sz}{ok ? '' : ' (sold out)'}</option>;
                            })}
                          </select>
                          <div className="flex items-center h-8 border border-rule">
                            <button type="button" onClick={() => updateCartItem(item.productId, item.size, item.quantity - 1)} className="w-8 h-full hover:bg-stone" aria-label={`One less ${item.name}`}>−</button>
                            <span className="w-7 text-center tabular-nums" aria-live="polite">{item.quantity}</span>
                            <button type="button" onClick={() => updateCartItem(item.productId, item.size, item.quantity + 1)} className="w-8 h-full hover:bg-stone" aria-label={`One more ${item.name}`}>+</button>
                          </div>
                          <button type="button" onClick={() => removeFromCart(item.productId, item.size)} className="ml-auto text-graphite underline underline-offset-2 hover:text-ink">Remove</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="h-px bg-black/10 mb-4" />
              <div className="flex justify-between mb-2.5">
                <span className="text-sm text-charcoal/60">Subtotal</span>
                <span className="text-sm font-mono">Tk {subtotal.toLocaleString()}</span>
              </div>
              {coupon && (
                <div className="flex justify-between mb-2.5">
                  <span className="text-sm text-charcoal/60">
                    Discount ({coupon.code}){' '}
                    <button type="button" onClick={() => { setCoupon(null); setCouponInput(''); }} className="underline underline-offset-2 text-[12px]">Remove</button>
                  </span>
                  <span className="text-sm font-mono">− Tk {discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between mb-4">
                <span className="text-sm text-charcoal/60">Shipping</span>
                <span className="text-sm font-mono">{form.district ? `Tk ${deliveryCharge}` : 'Choose a district'}</span>
              </div>

              {!coupon && (
                <div className="mb-5">
                  <div className="flex border border-rule">
                    <label htmlFor="coupon" className="sr-only">Discount code</label>
                    <input
                      id="coupon"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }}
                      placeholder="Discount code"
                      className="flex-1 min-w-0 px-3 py-2.5 text-[13px] outline-none bg-transparent"
                    />
                    <button type="button" onClick={applyCoupon} disabled={checkingCoupon} className="px-4 text-[13px] border-l border-rule hover:bg-stone disabled:opacity-50">
                      {checkingCoupon ? 'Checking…' : 'Apply'}
                    </button>
                  </div>
                  {couponError && <p className="mt-1.5 text-[12px] text-coral">{couponError}</p>}
                </div>
              )}

              <div className="flex justify-between items-center bg-stone px-4 py-4 mb-6">
                <span className="font-semibold text-black">Total</span>
                <span className="text-xl font-mono font-bold text-black">Tk {total.toLocaleString()}</span>
              </div>

              {selectedMethod && form.district && (
                <div className="bg-stone p-4 flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
                    <Truck size={16} strokeWidth={2} className="text-[#000]" />
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
