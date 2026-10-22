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
import { BKASH_NUMBER } from '@/admin/lib/delivery.js';

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

// All 64 districts. Dhaka is cash on delivery; every other district pays
// the delivery charge in advance by bKash (create_order checks the same).
const OUTSIDE_DHAKA = [
  'Bagerhat', 'Bandarban', 'Barguna', 'Barishal', 'Bhola', 'Bogura', 'Brahmanbaria', 'Chandpur',
  'Chapai Nawabganj', 'Chattogram', 'Chuadanga', "Cox's Bazar", 'Cumilla', 'Dinajpur', 'Faridpur',
  'Feni', 'Gaibandha', 'Gazipur', 'Gopalganj', 'Habiganj', 'Jamalpur', 'Jashore', 'Jhalokathi',
  'Jhenaidah', 'Joypurhat', 'Khagrachhari', 'Khulna', 'Kishoreganj', 'Kurigram', 'Kushtia',
  'Lakshmipur', 'Lalmonirhat', 'Madaripur', 'Magura', 'Manikganj', 'Meherpur', 'Moulvibazar',
  'Munshiganj', 'Mymensingh', 'Naogaon', 'Narail', 'Narayanganj', 'Narsingdi', 'Natore', 'Netrokona',
  'Nilphamari', 'Noakhali', 'Pabna', 'Panchagarh', 'Patuakhali', 'Pirojpur', 'Rajbari', 'Rajshahi',
  'Rangamati', 'Rangpur', 'Satkhira', 'Shariatpur', 'Sherpur', 'Sirajganj', 'Sunamganj', 'Sylhet',
  'Tangail', 'Thakurgaon',
];

// "Save this information for next time" keeps the delivery details here,
// in this browser only.
const SAVED_INFO_KEY = 'sunday_checkout_info';
function savedInfo() {
  try { return JSON.parse(localStorage.getItem(SAVED_INFO_KEY)) || null; } catch { return null; }
}

// Delivery and payment (the same rule as create_order):
//   Dhaka          Tk 80 delivery — cash on delivery, or all by bKash now.
//   Outside Dhaka  Tk 120 delivery — Tk 200 by bKash now and the rest on
//                  delivery, or all by bKash now.
const SHIPPING_METHODS = [
  { key: 'inside_dhaka', label: 'Inside Dhaka', price: 80 },
  { key: 'outside_dhaka_advance', label: 'Outside Dhaka', price: 120 },
];
const OUTSIDE_ADVANCE = 200;

export default function Checkout() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [bag, setBag] = useState(getCart());
  const [catalog, setCatalog] = useState(new Map()); // productId → product (with sale)
  const placed = useRef(false);
  const [form, setForm] = useState(() => ({
    full_name: '', email: '', mobile: '', address: '', district: '', area: '', postal: '', notes: '',
    ...(savedInfo() || {}),
  }));
  const [newsOptIn, setNewsOptIn] = useState(false);
  const [saveInfo, setSaveInfo] = useState(() => !!savedInfo());
  const [agreed, setAgreed] = useState(false);
  const [bkashTrxId, setBkashTrxId] = useState('');
  const [payOption, setPayOption] = useState('cod'); // cod | advance | full
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
  // Outside Dhaka can't be all cash on delivery; Dhaka has no part advance.
  const outside = !!form.district && form.district !== 'Dhaka';
  const pay = !form.district ? 'cod' : outside ? (payOption === 'full' ? 'full' : 'advance') : (payOption === 'full' ? 'full' : 'cod');
  const isAdvancePay = pay !== 'cod'; // a bKash payment (part or whole) is needed
  const payNow = pay === 'full' ? total : pay === 'advance' ? Math.min(OUTSIDE_ADVANCE, total) : 0;
  const payLater = total - payNow;
  const paymentMethod = pay === 'full' ? 'bkash_full' : pay === 'advance' ? 'bkash_advance' : 'cod';

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
    if (!agreed) { setSubmitError('Tick the box to agree to the terms before placing the order.'); return; }
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
      // No postal code column on orders: it rides at the end of the address.
      p_address: form.postal.trim() ? `${form.address.trim()}, ${form.postal.trim()}` : form.address,
      p_district: form.district,
      p_area: form.area,
      p_notes: form.notes,
      p_items: cartItems,
      p_payment_method: paymentMethod,
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
          payment_method: paymentMethod,
          advance_amount: payNow,
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

    // "Save this information" and "Email me with news" — neither can hold
    // up the order.
    try {
      if (saveInfo) {
        const { full_name, email, mobile, address, district, area, postal } = form;
        localStorage.setItem(SAVED_INFO_KEY, JSON.stringify({ full_name, email, mobile, address, district, area, postal }));
      } else localStorage.removeItem(SAVED_INFO_KEY);
    } catch { /* storage off */ }
    if (newsOptIn && form.email.trim()) {
      await supabase.from('newsletter_subscribers').insert({ email: form.email.trim() }).then(() => {}, () => {});
    }

    placed.current = true;
    clearCart();
    navigate(`/order-confirmation/${oid}`);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-10 md:py-16">
        {/* Top: back to the shop, and sign in for a returning customer. */}
        <div className="flex items-center justify-between gap-4 mb-8 text-[12px] uppercase tracking-[0.14em]">
          <Link to="/shop" className="inline-flex items-center gap-2 text-graphite hover:text-ink transition-colors">
            <ArrowLeft size={14} /> Continue shopping
          </Link>
          {isAuthenticated ? (
            <span className="normal-case tracking-normal text-[13px] text-graphite truncate">Signed in{user?.email ? ` as ${user.email}` : ''}</span>
          ) : (
            <Link to="/login?next=/checkout" className="h-10 px-5 inline-flex items-center border border-ink hover:bg-ink hover:text-white transition-colors">
              Sign in
            </Link>
          )}
        </div>

        <div className="text-center mb-10">
          <h1 className="font-heading text-[32px] md:text-[40px] leading-none">Checkout</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-16">
          {/* Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-10">
              {/* 1. Contact */}
              <fieldset className="space-y-4">
                <legend className="w-full flex items-baseline justify-between mb-4">
                  <span className="font-heading text-[24px]">Contact</span>
                  {!isAuthenticated && (
                    <Link to="/login?next=/checkout" className="text-[13px] underline underline-offset-4">Have an account? Sign in</Link>
                  )}
                </legend>
                <div>
                  <label htmlFor="co-email" className="text-[13px] block mb-2">Email *</label>
                  <input id="co-email" type="email" required autoComplete="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com" className="w-full h-12 border border-rule px-4 text-[14px] bg-white outline-none focus:border-ink transition-colors placeholder:text-graphite/60" />
                </div>
                <label className="flex items-center gap-3 text-[14px] cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-black" checked={newsOptIn} onChange={(e) => setNewsOptIn(e.target.checked)} />
                  Email me with news and offers
                </label>
                <div>
                  <label htmlFor="co-mobile" className="text-[13px] block mb-2">Mobile number *</label>
                  <input id="co-mobile" type="tel" required autoComplete="tel" value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    placeholder="01XXXXXXXXX" className="w-full h-12 border border-rule px-4 text-[14px] bg-white outline-none focus:border-ink transition-colors placeholder:text-graphite/60" />
                </div>
              </fieldset>

              {/* 2. Delivery */}
              <fieldset className="space-y-4">
                <legend className="font-heading text-[24px] mb-4">Delivery</legend>
                <div>
                  <label htmlFor="co-name" className="text-[13px] block mb-2">Full name *</label>
                  <input id="co-name" type="text" required autoComplete="name" value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full h-12 border border-rule px-4 text-[14px] bg-white outline-none focus:border-ink transition-colors placeholder:text-graphite/60" />
                </div>
                <div>
                  <label htmlFor="co-district" className="text-[13px] block mb-2">District *</label>
                  <select id="co-district" required value={form.district}
                    onChange={(e) => setForm({ ...form, district: e.target.value })} className="w-full h-12 border border-rule px-4 text-[14px] bg-white outline-none focus:border-ink transition-colors placeholder:text-graphite/60">
                    <option value="">Select your district</option>
                    <optgroup label="Inside Dhaka · cash on delivery">
                      <option value="Dhaka">Dhaka</option>
                    </optgroup>
                    <optgroup label="Outside Dhaka · Tk 120 delivery, Tk 200 advance by bKash">
                      {OUTSIDE_DHAKA.map((d) => <option key={d} value={d}>{d}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-4">
                  <div>
                    <label htmlFor="co-area" className="text-[13px] block mb-2">Area / thana *</label>
                    <input id="co-area" type="text" required value={form.area}
                      onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. Dhanmondi" className="w-full h-12 border border-rule px-4 text-[14px] bg-white outline-none focus:border-ink transition-colors placeholder:text-graphite/60" />
                  </div>
                  <div>
                    <label htmlFor="co-postal" className="text-[13px] block mb-2">Postal code</label>
                    <input id="co-postal" type="text" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.postal}
                      onChange={(e) => setForm({ ...form, postal: e.target.value.replace(/[^0-9]/g, '') })} placeholder="e.g. 1209" className="w-full h-12 border border-rule px-4 text-[14px] bg-white outline-none focus:border-ink transition-colors placeholder:text-graphite/60" />
                  </div>
                </div>
                <div>
                  <label htmlFor="co-address" className="text-[13px] block mb-2">Full address *</label>
                  <textarea id="co-address" required rows={3} autoComplete="street-address" value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="House, road, block or village"
                    className="w-full border border-rule px-4 py-3 text-[14px] bg-white outline-none focus:border-ink transition-colors resize-none placeholder:text-graphite/60" />
                </div>
                <div>
                  <label htmlFor="co-notes" className="text-[13px] block mb-2">Notes (optional)</label>
                  <textarea id="co-notes" rows={2} value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Anything the rider should know"
                    className="w-full border border-rule px-4 py-3 text-[14px] bg-white outline-none focus:border-ink transition-colors resize-none placeholder:text-graphite/60" />
                </div>
                <label className="flex items-center gap-3 text-[14px] cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-black" checked={saveInfo} onChange={(e) => setSaveInfo(e.target.checked)} />
                  Save this information for next time
                </label>
              </fieldset>

              {/* 3. Payment: follows the district. */}
              <fieldset>
                <legend className="font-heading text-[24px] mb-4">Payment</legend>
                {!form.district ? (
                  <p className="border border-rule px-4 py-4 text-[13px] text-graphite bg-white">Choose your district above to see how you’ll pay.</p>
                ) : (
                  <div className="space-y-3">
                    {/* The two ways to pay for this district. */}
                    {(outside
                      ? [
                          ['advance', `Tk ${Math.min(OUTSIDE_ADVANCE, total).toLocaleString()} now by bKash, the rest on delivery`, `Outside Dhaka needs Tk ${OUTSIDE_ADVANCE} up front. Pay the rider Tk ${(total - Math.min(OUTSIDE_ADVANCE, total)).toLocaleString()} when your order arrives.`],
                          ['full', `Pay the full Tk ${total.toLocaleString()} now by bKash`, 'Products and delivery paid now — nothing to pay when it arrives.'],
                        ]
                      : [
                          ['cod', 'Cash on delivery', `Nothing to pay now. Pay the rider Tk ${total.toLocaleString()} when your order arrives.`],
                          ['full', `Pay the full Tk ${total.toLocaleString()} now by bKash`, 'Products and delivery paid now — nothing to pay when it arrives.'],
                        ]
                    ).map(([key, title, note]) => (
                      <label key={key} className={`flex items-start gap-3 border px-4 py-4 bg-white cursor-pointer transition-colors ${pay === key ? 'border-ink' : 'border-rule hover:border-graphite'}`}>
                        <input type="radio" name="pay" className="mt-1 accent-black" checked={pay === key} onChange={() => setPayOption(key)} />
                        <span>
                          <span className="block text-[14px]">{title}</span>
                          <span className="block text-[13px] text-graphite mt-1">{note}</span>
                        </span>
                      </label>
                    ))}

                    {isAdvancePay && (
                      // bKash: what to send, where, and the Transaction ID.
                      <div className="border border-ink bg-[#F6F1E7]">
                        <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-black/10">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-burgundy">{pay === 'full' ? 'Full payment by bKash' : 'Outside Dhaka · advance payment'}</p>
                            <p className="text-[14px] mt-1">
                              {pay === 'full' ? 'Send the whole order by bKash to place it.' : `Send Tk ${payNow.toLocaleString()} by bKash to place your order. Tk ${payLater.toLocaleString()} is paid on delivery.`}
                            </p>
                          </div>
                          <span className="shrink-0 font-heading text-[26px] leading-none">Tk {payNow.toLocaleString()}</span>
                        </div>
                        <div className="px-5 py-5 space-y-5">
                          <div className="flex items-center justify-between gap-3 bg-white border border-black/10 px-4 h-14">
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-[0.14em] text-graphite">bKash number · Send money</p>
                              <p className="text-[16px] tabular-nums tracking-wide">{BKASH_NUMBER}</p>
                            </div>
                            <button type="button" onClick={handleCopyNumber}
                              className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 border border-ink text-[11px] uppercase tracking-[0.14em] hover:bg-ink hover:text-white transition-colors">
                              {numberCopied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                            </button>
                          </div>
                          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-[13px] text-graphite">
                            {['Open the bKash app or dial *247#', 'Choose Send Money', `Send Tk ${payNow.toLocaleString()} to the number above`, 'Copy the Transaction ID from the SMS'].map((step, i) => (
                              <li key={step} className="flex gap-3">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-ink text-white text-[11px] flex items-center justify-center">{i + 1}</span>
                                {step}
                              </li>
                            ))}
                          </ol>
                          <div>
                            <label htmlFor="co-trx" className="text-[13px] block mb-2">Transaction ID *</label>
                            <input id="co-trx" type="text" required={isAdvancePay} value={bkashTrxId}
                              onChange={(e) => setBkashTrxId(e.target.value.toUpperCase().trim())}
                              placeholder="e.g. K8H7G6F5D4" autoComplete="off"
                              className="w-full h-12 border border-rule px-4 text-[14px] bg-white outline-none focus:border-ink transition-colors placeholder:text-graphite/60 uppercase tracking-[0.12em]" />
                            <p className="mt-2 text-[12px] text-graphite">The order can’t be placed without it. We check it before your order ships.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </fieldset>

              {/* Terms, then the order. */}
              <div className="space-y-4">
                <label className="flex items-start gap-3 text-[14px] cursor-pointer">
                  <input type="checkbox" required className="mt-0.5 w-4 h-4 accent-black" checked={agreed}
                    onChange={(e) => { setAgreed(e.target.checked); setSubmitError(''); }} />
                  <span>
                    I agree to SUNDAY’s{' '}
                    <Link to="/support/terms" target="_blank" className="underline underline-offset-4">Terms of service</Link>,{' '}
                    <Link to="/support/refunds" target="_blank" className="underline underline-offset-4">Refund policy</Link> and{' '}
                    <Link to="/support/privacy" target="_blank" className="underline underline-offset-4">Privacy policy</Link>.
                  </span>
                </label>

                {submitError && <p className="text-[13px] text-coral" role="alert">{submitError}</p>}

                <button
                  type="submit"
                  disabled={submitting || !agreed}
                  className="w-full h-14 bg-ink text-white text-[13px] uppercase tracking-[0.14em] hover:bg-ink/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Placing order…' : `Place order · Tk ${total.toLocaleString()}`}
                </button>
              </div>
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

              <div className="flex justify-between items-center bg-stone px-4 py-4 mb-3">
                <span className="font-semibold text-black">Total</span>
                <span className="text-xl font-mono font-bold text-black">Tk {total.toLocaleString()}</span>
              </div>
              {form.district && (
                <div className="mb-6 px-1 space-y-1.5 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-graphite">Pay now by bKash</span>
                    <span>Tk {payNow.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-graphite">Pay on delivery</span>
                    <span>Tk {payLater.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {selectedMethod && form.district && (
                <div className="bg-stone p-4 flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
                    <Truck size={16} strokeWidth={2} className="text-[#000]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-black">{selectedMethod?.label}</p>
                    <p className="text-xs text-charcoal/50">
                      {pay === 'full' ? 'Paid in full by bKash' : pay === 'advance' ? `Tk ${payNow.toLocaleString()} by bKash now, Tk ${payLater.toLocaleString()} on delivery` : 'Pay when you receive your order'}
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
