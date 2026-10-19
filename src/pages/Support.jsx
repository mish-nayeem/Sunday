import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { INFO_PAGES, SUPPORT_TABS } from '@/admin/content/info-pages.js';
import { DEFAULT_PORTAL, fetchPortal, fetchSupportPages, findOrder, sendRequest } from '@/admin/lib/support.js';
import { imgUrl } from '@/lib/storage';
import { formatPrice } from '@/lib/catalog';

// /support/<tab>: every policy page and the Return & Exchange Portal behind
// one row of tabs. The copy comes from Admin → Support → Support pages.
export default function Support() {
  const { slug = 'refunds' } = useParams();
  const tab = SUPPORT_TABS.find((t) => t.slug === slug);
  const [pages, setPages] = useState(INFO_PAGES);
  const tabsRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchSupportPages().then(({ pages: p }) => alive && setPages(p));
    return () => { alive = false; };
  }, []);

  // On a phone the row scrolls sideways; keep the open tab in view.
  useEffect(() => {
    const on = tabsRef.current?.querySelector('[aria-current="page"]');
    if (on) tabsRef.current.scrollTo({ left: on.offsetLeft - 16 });
  }, [slug]);

  if (!tab) return <Navigate to="/support" replace />;
  const page = slug === 'portal' ? null : pages[slug];

  return (
    <div className="px-4 md:px-6 pb-20">
      <nav ref={tabsRef} className="flex gap-5 overflow-x-auto hide-scrollbar border-b border-rule py-3 -mx-4 md:-mx-6 px-4 md:px-6" aria-label="Support">
        {SUPPORT_TABS.map((t) => (
          <Link
            key={t.slug}
            to={`/support/${t.slug}`}
            aria-current={t.slug === slug ? 'page' : undefined}
            className={`shrink-0 text-[13px] pb-1 border-b ${t.slug === slug ? 'border-ink' : 'border-transparent text-graphite hover:text-ink'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {slug === 'portal' ? <ReturnPortal /> : page && <InfoBody page={page} />}
    </div>
  );
}

function InfoBody({ page }) {
  return (
    <article className="max-w-2xl pt-8 md:pt-12">
      <h1 className="font-heading text-[32px] md:text-[44px] leading-tight">{page.title}</h1>
      {page.intro && <p className="mt-3 text-[15px] leading-relaxed text-graphite">{page.intro}</p>}

      <div className="mt-10 space-y-10">
        {page.blocks.map((block, i) => {
          if (block.type === 'contact') {
            return (
              <div key={i} className="grid sm:grid-cols-3 gap-px bg-rule border border-rule">
                {(block.items || []).map((item) => (
                  <a key={item.label} href={item.href || undefined} className="bg-white p-4 hover:bg-stone">
                    <p className="text-[12px] text-graphite">{item.label[0] + item.label.slice(1).toLowerCase()}</p>
                    <p className="text-[14px] mt-1 break-words">{item.value}</p>
                  </a>
                ))}
              </div>
            );
          }
          if (block.type === 'table') {
            return (
              <section key={i}>
                {block.heading && <h2 className="font-heading text-[22px] mb-3">{block.heading}</h2>}
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-ink">
                        {(block.head || []).map((h) => (
                          <th key={h} className="text-left font-normal py-2 pr-4 text-graphite">{h[0] + h.slice(1).toLowerCase()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(block.rows || []).map((row, ri) => (
                        <tr key={ri} className="border-b border-rule">
                          {row.map((cell, ci) => <td key={ci} className="py-2 pr-4 align-top">{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          }
          return (
            <section key={i}>
              {block.heading && <h2 className="font-heading text-[22px] mb-2">{block.heading}</h2>}
              <p className="text-[15px] leading-relaxed">{block.body}</p>
            </section>
          );
        })}
      </div>
    </article>
  );
}

const REASONS = {
  exchange: ['Wrong size', 'Wrong item sent', 'Faulty or damaged', 'Other'],
  refund: ['Wrong item sent', 'Faulty or damaged', 'Missing item', 'Other'],
};

const NOT_YET = "This order hasn't left us yet. Need a change? Contact us and we'll fix it before it ships.";
const STATUS_NOTE = {
  pending: NOT_YET,
  confirmed: NOT_YET,
  processing: NOT_YET,
  shipped: "This order is on the way. Check it in front of the rider and refuse it if anything is wrong. Requests open once it's delivered.",
  cancelled: 'This order was cancelled, so there is nothing to return.',
  returned: 'This order has already come back to us.',
};

const field = 'w-full border border-rule px-3 py-2.5 text-[14px] bg-white outline-none focus:border-ink';

// Look an order up by its number and the phone or email it was placed with,
// then ask for an exchange or a refund. Requests land in Admin → Support.
function ReturnPortal() {
  const [portal, setPortal] = useState(DEFAULT_PORTAL);
  const [orderId, setOrderId] = useState('');
  const [contact, setContact] = useState('');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('exchange');
  const [picked, setPicked] = useState({});
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(null);

  useEffect(() => {
    fetchPortal().then(({ portal: p }) => setPortal(p));
  }, []);

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!orderId.trim() || !contact.trim()) {
      setError('Enter your order number and the phone number or email you ordered with.');
      return;
    }
    setBusy(true);
    setError('');
    setOrder(null);
    setSent(null);
    const { order: o, error: err } = await findOrder(orderId.trim(), contact.trim());
    setBusy(false);
    if (err) return setError(err);
    setOrder(o);
    setPicked(o.items.length === 1 ? { 0: { on: true, exchange_size: '' } } : {});
    setReason('');
    setDetails('');
  };

  const toggle = (i, patch) => {
    setPicked((prev) => ({ ...prev, [i]: { on: false, exchange_size: '', ...prev[i], ...patch } }));
    setError('');
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const items = order.items
      .map((it, i) => ({ it, p: picked[i] }))
      .filter(({ p }) => p?.on)
      .map(({ it, p }) => ({
        product_name: it.product_name,
        size: it.size,
        qty: it.qty,
        exchange_size: kind === 'exchange' ? (p.exchange_size || '').trim() : '',
      }));
    if (!items.length) return setError('Pick at least one item.');
    if (kind === 'exchange' && items.some((it) => !it.exchange_size)) return setError('Write the size you want for every piece you are exchanging.');
    if (!reason) return setError('Choose a reason.');
    if (reason === 'Other' && !details.trim()) return setError('Tell us a little about what happened.');

    setBusy(true);
    setError('');
    const { id, error: err } = await sendRequest({ orderId: order.id, contact: contact.trim(), kind, reason, items, details: details.trim() });
    setBusy(false);
    if (err) return setError(err);
    setSent({ id, kind });
  };

  const open = order?.open_request;
  const canRequest = order && order.status === 'delivered' && !open;

  return (
    <div className={portal.image ? 'pt-8 md:pt-12 md:grid md:grid-cols-12 md:gap-10' : 'pt-8 md:pt-12'}>
      {portal.image && (
        <div className="hidden md:block md:col-span-5 bg-stone">
          <img src={imgUrl(portal.image, 900)} alt="" loading="lazy" className="w-full h-full object-cover" />
        </div>
      )}
      <div className={portal.image ? 'md:col-span-7 max-w-xl' : 'max-w-xl'}>
        <h1 className="font-heading text-[32px] md:text-[44px] leading-tight">{portal.heading}</h1>

        {!sent && (
          <form onSubmit={handleCheck} className="mt-6 space-y-4">
            {portal.intro && <p className="text-[15px] text-graphite">{portal.intro}</p>}
            <label className="block">
              <span className="text-[13px] block mb-1.5">Order number</span>
              <input className={field} value={orderId} onChange={(e) => setOrderId(e.target.value.toUpperCase())} placeholder="SND-…" autoComplete="off" />
            </label>
            <label className="block">
              <span className="text-[13px] block mb-1.5">Phone number or email</span>
              <input className={field} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="017XXXXXXXX or you@email.com" autoComplete="email" />
            </label>
            <button type="submit" disabled={busy} className="h-12 px-8 bg-ink text-white text-[13px] disabled:opacity-50">
              {busy && !order ? 'Checking…' : 'Check order'}
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-[13px] text-coral" role="alert">{error}</p>}

        {order && !sent && (
          <div className="mt-8 border-t border-ink pt-5">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-[12px] text-graphite">{order.id}</p>
                <p className="text-[15px]">Hi {order.first_name || 'there'}</p>
              </div>
              <span className="text-[12px] border border-rule px-2 py-0.5">{order.status}</span>
            </div>

            {open && (
              <p className="mt-4 text-[14px] bg-stone p-3">
                You already have an open {open.kind} request for this order (#{open.id}). We'll call or message you, no need to send another.
              </p>
            )}
            {!open && STATUS_NOTE[order.status] && (
              <p className="mt-4 text-[14px] bg-stone p-3">
                {STATUS_NOTE[order.status]} <Link to="/support/contact" className="underline underline-offset-2">Contact us</Link>
              </p>
            )}

            {canRequest && (
              <form onSubmit={handleSend} className="mt-6 space-y-5">
                <div className="flex border border-ink w-fit" role="radiogroup" aria-label="Request type">
                  {[['exchange', 'Exchange'], ['refund', 'Return and refund']].map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={kind === k}
                      onClick={() => { setKind(k); setReason(''); setError(''); }}
                      className={`h-10 px-4 text-[13px] ${kind === k ? 'bg-ink text-white' : ''}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <fieldset>
                  <legend className="text-[13px] mb-2">Which pieces?</legend>
                  <div className="border-t border-rule">
                    {order.items.map((it, i) => {
                      const p = picked[i] || {};
                      return (
                        <div key={i} className="border-b border-rule py-3">
                          <label className="flex items-center gap-3 text-[14px] cursor-pointer">
                            <input type="checkbox" className="accent-black" checked={!!p.on} onChange={(e) => toggle(i, { on: e.target.checked })} />
                            <span className="flex-1">{it.product_name} <span className="text-graphite">· {it.size} × {it.qty}</span></span>
                            <span>{formatPrice(it.price * it.qty)}</span>
                          </label>
                          {p.on && kind === 'exchange' && (
                            <label className="mt-2 ml-7 flex items-center gap-3 text-[13px]">
                              Size you want
                              <input
                                value={p.exchange_size || ''}
                                onChange={(e) => toggle(i, { exchange_size: e.target.value.toUpperCase() })}
                                placeholder="e.g. L"
                                maxLength={20}
                                className="w-20 border border-rule px-2 py-1.5 outline-none focus:border-ink"
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>

                <label className="block">
                  <span className="text-[13px] block mb-1.5">Reason</span>
                  <select className={field} value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }}>
                    <option value="">Choose a reason</option>
                    {REASONS[kind].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[13px] block mb-1.5">Details (optional)</span>
                  <textarea className={field} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What's wrong, a good time to call…" />
                </label>

                <button type="submit" disabled={busy} className="h-12 px-8 bg-ink text-white text-[13px] disabled:opacity-50">
                  {busy ? 'Sending…' : `Send ${kind} request`}
                </button>
                <p className="text-[12px] text-graphite">We reply within one working day. Keep the tags on; we may ask for a photo on WhatsApp.</p>
              </form>
            )}
          </div>
        )}

        {sent && (
          <div className="mt-8 border-t border-ink pt-5">
            <p className="text-[12px] text-graphite">Request #{sent.id}</p>
            <h2 className="font-heading text-[26px] mt-1">Request received</h2>
            <p className="mt-2 text-[15px] leading-relaxed">
              Your {sent.kind} request for {order.id} is with us. We'll call or message you within one working day to arrange the {sent.kind === 'exchange' ? 'swap' : 'pickup'}.
            </p>
            <Link to="/shop" className="mt-5 inline-flex items-center h-12 px-8 bg-ink text-white text-[13px]">Back to shop</Link>
          </div>
        )}
      </div>
    </div>
  );
}
