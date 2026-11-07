import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, RotateCcw, Check, X, ChevronLeft, Search, Plus, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { imgUrl } from '@/lib/storage';
import { CATEGORY_LABELS, SIZE_ORDER, formatPrice, isSizeAvailable } from '@/lib/catalog';
import { useLiveSales, withSale } from '@/lib/pricing';
import {
  DEFAULT_PORTAL, EXCHANGE_FEE, EXCHANGE_REASONS, REFUND_REASONS, REFUND_WRONG_SIZE,
  exchangeIsFree, fetchPortal, findOrder, sendRequest,
} from '@/admin/lib/support.js';

// Support → Returns and exchanges. Find the order (its number and the phone
// or email it was placed with), pick the pieces and what should happen to
// them — another size, another product at any price, a fresh copy of a
// faulty one, or the money back by bKash — and send. Requests land in
// Admin → Support → Returns & exchanges.

const DAMAGED = 'Faulty or damaged product received';
const REASONS = { exchange: EXCHANGE_REASONS, refund: REFUND_REASONS };

const NOT_YET = "This order hasn't left us yet. Need a change? Contact us and we'll fix it before it ships.";
const STATUS_NOTE = {
  pending: NOT_YET,
  confirmed: NOT_YET,
  processing: NOT_YET,
  shipped: "This order is on the way. Check it in front of the rider and refuse it if anything is wrong. Requests open once it's delivered.",
  cancelled: 'This order was cancelled, so there is nothing to return.',
  returned: 'This order has already come back to us. To have it sent again, contact us.',
};

// Orders looked up here before, kept in this browser so the number and
// phone needn't be typed again. One is forgotten once its request has been
// dealt with, when it can't be found, after 60 days, or with its ✕.
const RECENT_KEY = 'sunday_portal_recent';
const RECENT_DAYS = 60;

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const cutoff = Date.now() - RECENT_DAYS * 86400000;
    return Array.isArray(list) ? list.filter((r) => r && r.orderId && r.contact && r.at > cutoff) : [];
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))); } catch { /* private mode */ }
  return list.slice(0, 6);
}

const sameOrder = (a, b) => a.toUpperCase() === b.toUpperCase();
const sortSizes = (list) => [...list].sort((a, b) => {
  const ra = SIZE_ORDER.indexOf(a);
  const rb = SIZE_ORDER.indexOf(b);
  return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
});
const inStock = (p) => (p?.sizes || []).filter((z) => isSizeAvailable(p, z));
const categoryName = (c) => CATEGORY_LABELS[c] || String(c || '').replace(/_/g, ' ');

// + they pay it with the new piece, − we send it back by bKash.
function diffText(d) {
  if (!d) return 'Same price';
  return d > 0 ? `${formatPrice(d)} more` : `${formatPrice(-d)} back to you`;
}

// A row of sizes as square boxes; out of stock struck through.
function SizeBoxes({ product, value, same, onPick }) {
  const left = new Set(inStock(product));
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
      {sortSizes(product.sizes || []).map((z) => {
        const out = !left.has(z);
        const on = value === z;
        return (
          <button
            key={z}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={out}
            title={out ? 'Out of stock' : z === same ? 'The same size — a fresh piece for a faulty or damaged one' : undefined}
            onClick={() => onPick(z)}
            className={`relative min-w-[48px] h-11 px-3 border text-[13px] transition-colors ${
              on ? 'border-ink bg-ink text-white' : out ? 'border-rule text-graphite/50 line-through cursor-not-allowed' : 'border-rule hover:border-ink'
            }`}
          >
            {z}
            {z === same && <span className={`absolute -top-2 left-1/2 -translate-x-1/2 px-1 text-[9px] tracking-[0.12em] ${on ? 'bg-ink text-white' : 'bg-white text-graphite'}`}>SAME</span>}
          </button>
        );
      })}
    </div>
  );
}

// "Swap for another product": a panel sliding in from the right with every
// product in stock (nearest price first), a search, and category tabs.
// Opening one shows its photos, words and sizes; a size there chooses it.
function SwapDrawer({ item, pick, products, onPick, onClose }) {
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [viewId, setViewId] = useState(null);
  const [photo, setPhoto] = useState(0);
  const [size, setSize] = useState('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const key = (e) => {
      if (e.key !== 'Escape') return;
      if (viewId) setViewId(null);
      else onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [viewId, onClose]);

  const all = products
    .filter((p) => String(p.id) !== String(item.product_id) && inStock(p).length > 0)
    .sort((a, b) => Math.abs(a.price - item.price) - Math.abs(b.price - item.price));
  const cats = [...new Set(all.map((p) => p.category).filter(Boolean))];
  const needle = q.trim().toLowerCase();
  const shown = all.filter((p) => (!cat || p.category === cat)
    && (!needle || `${p.name} ${p.variant || ''}`.toLowerCase().includes(needle)));
  const view = viewId ? all.find((p) => String(p.id) === String(viewId)) : null;
  const diff = (p) => diffText((p.price - item.price) * (item.qty || 1));

  const open = (p) => {
    setViewId(p.id);
    setPhoto(0);
    setSize(String(pick.exchange_product_id) === String(p.id) ? pick.exchange_size || '' : '');
  };

  return (
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-label="Swap for another product">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close" onClick={onClose} />
      <div className="relative h-full w-full sm:max-w-[560px] bg-white flex flex-col shadow-xl">
        <div className="flex items-center justify-between gap-4 px-5 h-14 border-b border-rule shrink-0">
          {view ? (
            <button type="button" onClick={() => setViewId(null)} className="inline-flex items-center gap-1 text-[13px] hover:underline underline-offset-4">
              <ChevronLeft size={16} strokeWidth={1.5} /> All products
            </button>
          ) : (
            <p className="text-[13px]">Swap <span className="text-graphite">{item.product_name} · {item.size}</span> for…</p>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 -m-1"><X size={20} strokeWidth={1.5} /></button>
        </div>

        {!view && (
          <>
            <div className="px-5 pt-4 shrink-0">
              <label className="flex items-center gap-2 border-b border-ink pb-2">
                <Search size={16} strokeWidth={1.5} className="text-graphite" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="flex-1 min-w-0 outline-none text-[14px] bg-transparent" />
              </label>
              {cats.length > 1 && (
                <nav className="flex gap-6 overflow-x-auto hide-scrollbar mt-3 text-[11px] uppercase tracking-[0.14em]" aria-label="Categories">
                  {[['', 'All'], ...cats.map((c) => [c, categoryName(c)])].map(([k, label]) => (
                    <button key={k || 'all'} type="button" onClick={() => setCat(k)}
                      className={`shrink-0 py-2 border-b ${cat === k ? 'border-ink text-ink' : 'border-transparent text-graphite hover:text-ink'}`}>
                      {label}
                    </button>
                  ))}
                </nav>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4" data-lenis-prevent>
              <div className="grid grid-cols-2 gap-x-3 gap-y-6">
                {shown.map((p) => (
                  <button key={p.id} type="button" onClick={() => open(p)} className="text-left group">
                    <span className={`block aspect-[4/5] bg-stone overflow-hidden ${String(pick.exchange_product_id) === String(p.id) ? 'ring-2 ring-ink ring-offset-2' : ''}`}>
                      {p.images?.[0] && <img src={imgUrl(p.images[0], 400)} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" />}
                    </span>
                    <span className="block mt-2 text-[13px] leading-snug">{p.name}{p.variant ? `, ${p.variant}` : ''}</span>
                    <span className="block text-[12px] text-graphite">{formatPrice(p.price)} · {diff(p)}</span>
                  </button>
                ))}
              </div>
              {shown.length === 0 && <p className="py-16 text-center text-[14px] text-graphite">Nothing in stock matches. Try another category.</p>}
            </div>
          </>
        )}

        {view && (
          <div className="flex-1 overflow-y-auto" data-lenis-prevent>
            <div className="aspect-[4/5] bg-stone">
              {view.images?.[photo] && <img src={imgUrl(view.images[photo], 900)} alt={view.name} className="w-full h-full object-cover" />}
            </div>
            {view.images?.length > 1 && (
              <div className="flex gap-2 px-5 pt-3 overflow-x-auto hide-scrollbar">
                {view.images.map((src, n) => (
                  <button key={n} type="button" onClick={() => setPhoto(n)} aria-label={`Photo ${n + 1}`}
                    className={`w-14 h-[70px] shrink-0 bg-stone overflow-hidden border ${n === photo ? 'border-ink' : 'border-transparent'}`}>
                    <img src={imgUrl(src, 120)} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <div className="px-5 py-5 space-y-4">
              <div>
                <h2 className="font-heading text-[24px] leading-tight">{view.name}</h2>
                {view.variant && <p className="text-[13px] text-graphite">{view.variant}</p>}
                <p className="mt-1 text-[14px]">{formatPrice(view.price)} <span className="text-graphite">· {diff(view)}</span></p>
              </div>
              {view.description && <p className="text-[14px] leading-relaxed text-graphite whitespace-pre-line">{view.description}</p>}
              <div>
                <p className="text-[13px] mb-2">Size</p>
                <SizeBoxes product={view} value={size} onPick={setSize} />
              </div>
              <button type="button" disabled={!size} onClick={() => onPick(view, size)}
                className="h-12 w-full bg-ink text-white text-[13px] disabled:opacity-40">
                {size ? `Swap for this in ${size}` : 'Choose a size'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// One piece of the order, as a card: tick it, then say what it becomes.
function PieceCard({ it, product, pick, kind, needsSize, onChange, onSwap }) {
  const on = !!pick.on;
  const swapTo = pick.exchange_product_id ? pick.target : null;
  const others = Boolean(pick.anyOthers);
  const noneLeft = product && !inStock(product).some((z) => z !== it.size);
  return (
    <div className={`border transition-colors ${on ? 'border-ink' : 'border-rule'}`}>
      <label className="flex items-center gap-3 p-3 cursor-pointer">
        <span className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center ${on ? 'bg-ink border-ink text-white' : 'border-graphite'}`}>
          {on && <Check size={12} strokeWidth={2.5} />}
        </span>
        <input type="checkbox" className="sr-only" checked={on} onChange={(e) => onChange({ on: e.target.checked })} />
        <span className="w-12 h-[60px] shrink-0 bg-stone overflow-hidden">
          {product?.images?.[0] && <img src={imgUrl(product.images[0], 120)} alt="" className="w-full h-full object-cover" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] leading-snug truncate">{it.product_name}</span>
          <span className="block text-[12px] text-graphite">Size {it.size} · {it.qty} {it.qty === 1 ? 'piece' : 'pieces'}</span>
        </span>
        <span className="text-[13px] shrink-0">{formatPrice(it.price * it.qty)}</span>
      </label>

      {on && kind === 'exchange' && (
        <div className="border-t border-rule px-3 py-4 space-y-3 bg-stone/40">
          {!swapTo ? (
            <>
              <p className="text-[12px] uppercase tracking-[0.12em] text-graphite">New size</p>
              {product ? (
                <SizeBoxes product={product} value={pick.exchange_size} same={it.size} onPick={(z) => onChange({ exchange_size: z })} />
              ) : (
                <input value={pick.exchange_size || ''} onChange={(e) => onChange({ exchange_size: e.target.value.toUpperCase() })}
                  placeholder="e.g. L" maxLength={20} className="w-24 border border-rule px-3 py-2 text-[14px] outline-none focus:border-ink bg-white" />
              )}
              {noneLeft && <p className="text-[13px] text-graphite">No other size of this piece is in stock right now.</p>}
              {others && (
                <button type="button" onClick={onSwap} className="inline-flex items-center gap-1.5 text-[13px] underline underline-offset-4">
                  <ArrowLeftRight size={14} strokeWidth={1.5} /> {noneLeft ? 'Swap for another product' : 'Or swap for another product'}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-[12px] uppercase tracking-[0.12em] text-graphite">Swapping for</p>
              <div className="flex items-center gap-3 bg-white border border-rule p-2">
                <span className="w-12 h-[60px] shrink-0 bg-stone overflow-hidden">
                  {swapTo.images?.[0] && <img src={imgUrl(swapTo.images[0], 120)} alt="" className="w-full h-full object-cover" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] leading-snug truncate">{swapTo.name}{swapTo.variant ? `, ${swapTo.variant}` : ''}</span>
                  <span className="block text-[12px] text-graphite">Size {pick.exchange_size} · {diffText((swapTo.price - it.price) * (it.qty || 1))}</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
                <button type="button" onClick={onSwap} className="underline underline-offset-4">Change</button>
                <button type="button" onClick={() => onChange({ exchange_product_id: '', exchange_price: null, exchange_size: '', target: null })} className="underline underline-offset-4">
                  Keep {it.product_name} instead
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {on && needsSize && kind !== 'exchange' && (
        <label className="border-t border-rule px-3 py-3 flex items-center gap-3 text-[13px] bg-stone/40">
          Size you needed <span className="text-graphite">(optional)</span>
          <input value={pick.exchange_size || ''} onChange={(e) => onChange({ exchange_size: e.target.value.toUpperCase() })}
            placeholder="e.g. L" maxLength={20} className="w-20 border border-rule px-2 py-1.5 outline-none focus:border-ink bg-white" />
        </label>
      )}
    </div>
  );
}

// A heading with its step number down the side.
function Step({ n, title, children, done }) {
  return (
    <section className="grid grid-cols-[28px_1fr] gap-x-4">
      <span className={`w-7 h-7 rounded-full border flex items-center justify-center text-[12px] ${done ? 'bg-ink border-ink text-white' : 'border-ink'}`}>
        {done ? <Check size={13} strokeWidth={2.5} /> : n}
      </span>
      <div className="min-w-0 pb-2">
        <h2 className="text-[15px] leading-7 mb-3">{title}</h2>
        {children}
      </div>
    </section>
  );
}

const field = 'w-full border border-rule px-3 py-2.5 text-[14px] bg-white outline-none focus:border-ink';

export default function ReturnPortal() {
  const [params] = useSearchParams();
  const [portal, setPortal] = useState(DEFAULT_PORTAL);
  const [orderId, setOrderId] = useState(() => (params.get('order') || '').toUpperCase());
  const [contact, setContact] = useState(() => params.get('contact') || '');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('exchange');
  const [picked, setPicked] = useState({});
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [refundTo, setRefundTo] = useState('');
  const [sent, setSent] = useState(null);
  const [rawProducts, setRawProducts] = useState([]);
  const [recent, setRecent] = useState(readRecent);
  const [swapping, setSwapping] = useState(null);
  const sales = useLiveSales();

  // Every product at the price it sells for now (a running sale included):
  // what an exchange to it costs.
  const products = useMemo(() => rawProducts.map((p) => withSale(p, sales)), [rawProducts, sales]);
  const byId = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);

  useEffect(() => {
    fetchPortal().then(({ portal: p }) => setPortal(p));
    supabase.from('products').select('*').then(({ data }) => setRawProducts(data || []));
  }, []);

  useEffect(() => {
    if (orderId && contact) handleCheck();
    // Once, for a link that brings the order with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCheck(e) {
    e?.preventDefault();
    if (!orderId.trim() || !contact.trim()) {
      setError('Enter your order number and the phone number or email you ordered with.');
      return;
    }
    setBusy(true);
    setError('');
    setOrder(null);
    setSent(null);
    const id = orderId.trim();
    const who = contact.trim();
    const { order: o, error: err } = await findOrder(id, who);
    setBusy(false);
    if (err) {
      if (!err.startsWith('Something')) setRecent(writeRecent(readRecent().filter((r) => !sameOrder(r.orderId, id))));
      return setError(err);
    }
    setOrder(o);
    const before = readRecent().find((r) => sameOrder(r.orderId, id));
    const rest = readRecent().filter((r) => !sameOrder(r.orderId, id));
    const done = before?.sent && !o.open_request;
    setRecent(writeRecent(done ? rest : [{ orderId: id.toUpperCase(), contact: who, at: Date.now(), sent: Boolean(before?.sent || o.open_request) }, ...rest]));
    setPicked(o.items.length === 1 ? { 0: { on: true, exchange_size: '' } } : {});
    setSwapping(null);
    setReason('');
    setDetails('');
  }

  const toggle = (i, patch) => {
    setPicked((prev) => ({ ...prev, [i]: { on: false, exchange_size: '', ...prev[i], ...patch } }));
    setError('');
    if (patch.on === false) setSwapping((s) => (s === i ? null : s));
  };

  const needsSize = kind === 'exchange' || (kind === 'refund' && reason === REFUND_WRONG_SIZE);

  // The price difference over the pieces swapped to another product.
  const priceDiff = kind === 'exchange' && order
    ? order.items.reduce((sum, it, i) => {
      const p = picked[i];
      return p?.on && p.exchange_product_id && p.exchange_price != null ? sum + (p.exchange_price - it.price) * (it.qty || 1) : sum;
    }, 0)
    : 0;
  const zoneFee = order?.delivery_zone === 'outside' ? EXCHANGE_FEE.outside : EXCHANGE_FEE.inside;
  const parcelFee = kind === 'exchange' && reason && !exchangeIsFree(reason) ? zoneFee : 0;
  const needsBkash = kind === 'refund' || priceDiff < 0;

  async function handleSend(e) {
    e.preventDefault();
    const items = order.items
      .map((it, i) => ({ it, p: picked[i] }))
      .filter(({ p }) => p?.on)
      .map(({ it, p }) => ({
        product_name: it.product_name,
        size: it.size,
        qty: it.qty,
        exchange_size: needsSize ? (p.exchange_size || '').trim() : '',
        ...(kind === 'exchange' && p.exchange_product_id ? { exchange_product_id: String(p.exchange_product_id) } : {}),
      }));
    if (!items.length) return setError('Pick at least one piece.');
    if (kind === 'exchange' && items.some((it) => !it.exchange_size)) return setError('Pick the new size for every piece you are exchanging.');
    if (kind === 'exchange' && reason && reason !== DAMAGED && items.some((it) => !it.exchange_product_id && it.exchange_size === it.size)) {
      return setError(`The same size is only for a faulty or damaged piece. Pick another size, or choose "${DAMAGED}".`);
    }
    if (!reason) return setError('Choose a reason.');
    const bkash = refundTo.replace(/[^\d]/g, '');
    if (needsBkash && !/^01\d{9}$/.test(bkash)) {
      return setError(kind === 'refund'
        ? 'Give the bKash number for your refund (11 digits, 01…).'
        : 'Give the bKash number for the difference (11 digits, 01…).');
    }
    setBusy(true);
    setError('');
    const { id, error: err } = await sendRequest({
      orderId: order.id, contact: contact.trim(), kind, reason, items, details: details.trim(),
      refundTo: needsBkash ? bkash : '',
    });
    setBusy(false);
    if (err) return setError(err);
    setRecent(writeRecent(readRecent().map((r) => (sameOrder(r.orderId, orderId.trim()) ? { ...r, sent: true, at: Date.now() } : r))));
    setSent({ id, kind, diff: priceDiff, fee: parcelFee, bkash: needsBkash ? bkash : '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const open = order?.open_request;
  const canRequest = order && order.status === 'delivered' && !open;
  const anyPicked = order && order.items.some((_, i) => picked[i]?.on);
  const swapItem = swapping != null && kind === 'exchange' ? order?.items?.[swapping] : null;
  const othersExist = (it) => products.some((p) => String(p.id) !== String(it.product_id) && inStock(p).length > 0);
  const step = sent ? 3 : canRequest ? 2 : 1;

  return (
    <div className="pt-8 md:pt-12 md:grid md:grid-cols-12 md:gap-10">
      {/* The way through, down the side on a computer. */}
      <aside className="hidden md:block md:col-span-4 lg:col-span-3">
        <div className="sticky top-28 space-y-6">
          {portal.image && (
            <div className="aspect-[4/5] bg-stone overflow-hidden">
              <img src={imgUrl(portal.image, 700)} alt="" loading="lazy" className="w-full h-full object-cover" />
            </div>
          )}
          <ol className="space-y-3 text-[13px]">
            {['Find your order', 'Choose what to send back', 'We call you and collect it'].map((label, i) => (
              <li key={label} className={`flex items-center gap-3 ${i + 1 === step ? 'text-ink' : 'text-graphite'}`}>
                <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-[11px] ${i + 1 < step ? 'bg-ink border-ink text-white' : i + 1 === step ? 'border-ink' : 'border-rule'}`}>
                  {i + 1 < step ? <Check size={12} strokeWidth={2.5} /> : i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <div className="md:col-span-8 lg:col-span-7 max-w-2xl">
        <h1 className="font-heading text-[32px] md:text-[44px] leading-tight">{portal.heading}</h1>
        {portal.intro && !sent && <p className="mt-3 text-[15px] text-graphite">{portal.intro}</p>}

        {!sent && (
          <form onSubmit={handleCheck} className="mt-8 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <label className="block">
              <span className="text-[12px] uppercase tracking-[0.12em] text-graphite block mb-1.5">Order number</span>
              <input className={field} value={orderId} onChange={(e) => setOrderId(e.target.value.toUpperCase())} placeholder="SND-…" autoComplete="off" />
            </label>
            <label className="block">
              <span className="text-[12px] uppercase tracking-[0.12em] text-graphite block mb-1.5">Phone or email</span>
              <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="017XXXXXXXX" autoComplete="email" />
            </label>
            <button type="submit" disabled={busy} className="h-[46px] px-6 bg-ink text-white text-[13px] disabled:opacity-50">
              {busy && !order ? 'Finding…' : 'Find order'}
            </button>
          </form>
        )}

        {/* Orders looked up before, one tap to fill both boxes. */}
        {!sent && recent.length > 0 && !order && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-graphite">Recent:</span>
            {recent.map((r) => (
              <span key={r.orderId} className="inline-flex items-center border border-rule">
                <button type="button" className="pl-3 pr-2 py-1.5 hover:bg-stone" onClick={() => { setOrderId(r.orderId); setContact(r.contact); }}>
                  {r.orderId}
                </button>
                <button type="button" aria-label={`Forget ${r.orderId}`} className="px-2 py-1.5 border-l border-rule text-graphite hover:text-ink"
                  onClick={() => setRecent(writeRecent(readRecent().filter((x) => !sameOrder(x.orderId, r.orderId))))}>
                  <X size={12} strokeWidth={1.75} />
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <p className="mt-5 text-[13px] text-coral" role="alert">{error}</p>}

        {order && !sent && (
          <div className="mt-10">
            <div className="flex items-center justify-between gap-4 border-b border-ink pb-3">
              <p className="text-[15px]">Hi {order.first_name || 'there'} <span className="text-graphite">· {order.id}</span></p>
              <span className="text-[11px] uppercase tracking-[0.14em] bg-stone px-2 py-1">{order.status}</span>
            </div>

            {open && (
              <p className="mt-5 text-[14px] border-l-2 border-ink pl-3">
                You already have an open {open.kind} request for this order (#{open.id}). We'll call or message you, no need to send another.
              </p>
            )}
            {!open && STATUS_NOTE[order.status] && (
              <p className="mt-5 text-[14px] border-l-2 border-ink pl-3">
                {STATUS_NOTE[order.status]} <Link to="/support/contact" className="underline underline-offset-2">Contact us</Link>
              </p>
            )}

            {canRequest && (
              <form onSubmit={handleSend} className="mt-8 space-y-8">
                <Step n={1} title="What would you like?" done>
                  <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Request type">
                    {[
                      ['exchange', ArrowLeftRight, 'Exchange', 'Another size, another product, or a fresh piece'],
                      ['refund', RotateCcw, 'Return and refund', 'Money back by bKash, when the mistake is ours'],
                    ].map(([k, Icon, label, sub]) => (
                      <button key={k} type="button" role="radio" aria-checked={kind === k}
                        onClick={() => { setKind(k); setReason(''); setError(''); setSwapping(null); }}
                        className={`text-left p-4 border transition-colors ${kind === k ? 'border-ink bg-ink text-white' : 'border-rule hover:border-ink'}`}>
                        <Icon size={20} strokeWidth={1.5} />
                        <span className="block mt-3 text-[15px]">{label}</span>
                        <span className={`block text-[12px] mt-0.5 ${kind === k ? 'text-white/75' : 'text-graphite'}`}>{sub}</span>
                      </button>
                    ))}
                  </div>
                </Step>

                <Step n={2} title="Which pieces?" done={anyPicked}>
                  <div className="space-y-3">
                    {order.items.map((it, i) => {
                      const p = picked[i] || {};
                      return (
                        <PieceCard
                          key={i}
                          it={it}
                          product={byId.get(String(it.product_id))}
                          pick={{ ...p, target: p.exchange_product_id ? byId.get(String(p.exchange_product_id)) : null, anyOthers: othersExist(it) }}
                          kind={kind}
                          needsSize={needsSize}
                          onChange={(patch) => toggle(i, patch)}
                          onSwap={() => setSwapping(i)}
                        />
                      );
                    })}
                  </div>
                </Step>

                <Step n={3} title="Why?" done={Boolean(reason)}>
                  <div className="space-y-2" role="radiogroup" aria-label="Reason">
                    {REASONS[kind].map((r) => (
                      <label key={r} className={`flex items-center gap-3 px-3 py-2.5 border cursor-pointer text-[14px] ${reason === r ? 'border-ink' : 'border-rule hover:border-graphite'}`}>
                        <input type="radio" name="reason" className="accent-black" checked={reason === r} onChange={() => { setReason(r); setError(''); }} />
                        <span className="flex-1">{r}</span>
                        {kind === 'exchange' && <span className="text-[11px] text-graphite">{exchangeIsFree(r) ? 'Free delivery' : `Delivery ${formatPrice(zoneFee)}`}</span>}
                      </label>
                    ))}
                  </div>
                  {kind === 'exchange' && reason && !exchangeIsFree(reason) && (
                    <p className="mt-3 text-[13px] text-graphite">
                      The new piece comes in a second parcel: {formatPrice(zoneFee)} ({order.delivery_zone === 'outside' ? 'outside' : 'inside'} Dhaka), paid to the rider when it arrives.
                    </p>
                  )}
                </Step>

                {kind === 'refund' && (
                  <details className="group border-y border-rule">
                    <summary className="flex items-center justify-between py-3 cursor-pointer list-none text-[13px] uppercase tracking-[0.12em]">
                      How a refund works
                      <Plus size={16} strokeWidth={1.5} className="group-open:hidden" />
                      <Minus size={16} strokeWidth={1.5} className="hidden group-open:block" />
                    </summary>
                    <div className="pb-4 space-y-3 text-[14px] leading-relaxed text-graphite">
                      <p>Refunds are offered only when an issue occurs on our end, such as receiving a faulty or damaged item, an incorrect product, or an incorrect size.</p>
                      <p>If you receive the wrong size and your originally ordered size is available in stock, we'll gladly arrange an exchange at no additional cost. If the correct size is unavailable, you'll be eligible for a refund.</p>
                      <p>If you've accidentally ordered the wrong size, you may request an exchange, subject to our exchange policy and stock availability. However, such cases are not eligible for refunds.</p>
                      <p>For approved refunds, our team will contact you to confirm the details and arrange collection of the item at our expense. Once the item has been collected and verified, your refund will be processed to your bKash account.</p>
                      <p>Please note that the original delivery charge is non-refundable.</p>
                    </div>
                  </details>
                )}

                {/* What it comes to, like a small receipt. */}
                {kind === 'exchange' && (priceDiff !== 0 || parcelFee > 0) && (
                  <div className="bg-stone p-4 text-[14px]">
                    <p className="text-[12px] uppercase tracking-[0.12em] mb-3">{priceDiff < 0 ? 'Money back to you' : 'You pay the rider'}</p>
                    <dl className="space-y-1.5">
                      {priceDiff !== 0 && (
                        <div className="flex justify-between"><dt>Price difference</dt><dd>{priceDiff > 0 ? '+ ' : ''}{formatPrice(Math.abs(priceDiff))}</dd></div>
                      )}
                      {parcelFee > 0 && <div className="flex justify-between"><dt>Delivery of the new piece</dt><dd>+ {formatPrice(parcelFee)}</dd></div>}
                      <div className="flex justify-between border-t border-dashed border-graphite/40 pt-2 mt-2">
                        <dt>{priceDiff < 0 ? 'By bKash, once the exchange is done' : 'Cash to the rider'}</dt>
                        <dd>{formatPrice(priceDiff < 0 ? -priceDiff : priceDiff + parcelFee)}</dd>
                      </div>
                      {priceDiff < 0 && parcelFee > 0 && <p className="text-[12px] text-graphite pt-1">The delivery charge is paid to the rider.</p>}
                    </dl>
                  </div>
                )}

                {needsBkash && (
                  <label className="block">
                    <span className="text-[12px] uppercase tracking-[0.12em] text-graphite block mb-1.5">
                      Your bKash number {kind === 'refund' ? '— the refund goes here' : '— the difference goes here'}
                    </span>
                    <input className={field} value={refundTo} onChange={(e) => { setRefundTo(e.target.value); setError(''); }} inputMode="tel" placeholder="01XXXXXXXXX" maxLength={14} />
                  </label>
                )}

                <label className="block">
                  <span className="text-[12px] uppercase tracking-[0.12em] text-graphite block mb-1.5">Anything else? (optional)</span>
                  <textarea className={field} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What's wrong, a good time to call…" />
                </label>

                <div>
                  <button type="submit" disabled={busy} className="h-12 w-full sm:w-auto px-10 bg-ink text-white text-[13px] disabled:opacity-50">
                    {busy ? 'Sending…' : kind === 'exchange' ? 'Send exchange request' : 'Send refund request'}
                  </button>
                  <p className="mt-3 text-[12px] text-graphite">We reply within one working day. For a fault or a wrong item, keep the tags on; we may ask for a photo on WhatsApp.</p>
                </div>
              </form>
            )}
          </div>
        )}

        {sent && (
          <div className="mt-10">
            <span className="w-12 h-12 rounded-full bg-ink text-white flex items-center justify-center"><Check size={22} strokeWidth={2} /></span>
            <h2 className="font-heading text-[28px] mt-5">Request received</h2>
            <p className="mt-1 text-[13px] text-graphite">Request #{sent.id} · {order.id}</p>
            <ol className="mt-6 space-y-3 text-[15px] leading-relaxed">
              <li>1. We call or message you within one working day.</li>
              <li>2. A rider {sent.kind === 'exchange' ? 'brings the new piece and takes the old one back' : 'collects the piece, at our cost'}.</li>
              {sent.kind === 'refund' && <li>3. Once it's checked, the refund goes to bKash {sent.bkash}. If the size you needed is in stock, we'll offer an exchange instead.</li>}
              {sent.kind === 'exchange' && sent.diff > 0 && <li>3. Pay the rider {formatPrice(sent.diff + sent.fee)} with the new piece{sent.fee ? ' (difference and delivery)' : ''}.</li>}
              {sent.kind === 'exchange' && sent.diff < 0 && <li>3. We send {formatPrice(-sent.diff)} to bKash {sent.bkash} once it's done{sent.fee ? `; keep ${formatPrice(sent.fee)} ready for the rider's delivery charge` : ''}.</li>}
              {sent.kind === 'exchange' && sent.diff === 0 && sent.fee > 0 && <li>3. Keep {formatPrice(sent.fee)} ready for the rider's delivery charge.</li>}
            </ol>
            <Link to="/shop" className="mt-8 inline-flex items-center h-12 px-8 bg-ink text-white text-[13px]">Back to shop</Link>
          </div>
        )}
      </div>

      {swapItem && createPortal(
        <SwapDrawer
          item={swapItem}
          pick={picked[swapping] || {}}
          products={products}
          onClose={() => setSwapping(null)}
          onPick={(prod, size) => {
            toggle(swapping, { exchange_product_id: prod.id, exchange_price: Number(prod.price), exchange_size: size });
            setSwapping(null);
          }}
        />,
        document.body,
      )}
    </div>
  );
}
