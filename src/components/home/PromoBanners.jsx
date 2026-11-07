import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { imgUrl } from '@/lib/storage';
import { fetchPromos, promoCards, colorOf } from '@/admin/lib/promos.js';
import { useCountdown } from '@/admin/components/DropCountdown.jsx';

// Offer cards (Admin → Website → Banners): a running sale with a countdown
// to its end, and the coupon boxes with a code to copy. Which kinds show on
// the homepage, the shop and the bag is set there too.

function Countdown({ at }) {
  const left = useCountdown(at);
  if (!left) return null;
  return <span className="tabular-nums">Ends in {left.toLowerCase()}</span>;
}

function CopyCode({ code, light }) {
  const [done, setDone] = useState(false);
  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const t = document.createElement('textarea');
      t.value = code;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`shrink-0 h-9 px-3 text-[11px] uppercase tracking-[0.12em] border ${light ? 'border-white/70 hover:bg-white/10' : 'border-ink hover:bg-ink/5'}`}
    >
      {done ? 'Copied ✓' : 'Copy code'}
    </button>
  );
}

export function PromoCard({ card }) {
  const c = card.kind === 'coupon' ? colorOf(card.color) : null;
  const light = c ? c.ink.toUpperCase() === '#FFFFFF' : false;
  const body = (
    <>
      {card.image && (
        <img src={imgUrl(card.image, 200)} alt="" loading="lazy" className="w-14 h-[70px] object-cover shrink-0 bg-stone" />
      )}
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`text-[10.5px] uppercase tracking-[0.16em] ${c ? 'opacity-75' : 'text-coral'}`}>{card.kind === 'sale' ? 'Sale' : 'Coupon'}</span>
        <span className="text-[15px] leading-snug truncate">{card.title}</span>
        <span className={`text-[12px] truncate ${c ? 'opacity-80' : 'text-graphite'}`}>{card.sub}</span>
        {card.kind === 'sale' && <span className="text-[12px] text-graphite"><Countdown at={card.endsAt} /></span>}
      </span>
      {card.kind === 'coupon'
        ? <CopyCode code={card.code} light={light} />
        : <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] underline underline-offset-4">Shop</span>}
    </>
  );
  const cls = `flex items-center gap-3 p-3 min-w-0 ${c ? '' : 'border border-rule bg-white'}`;
  const style = c ? { background: c.bg, color: c.ink } : undefined;
  return card.link
    ? <Link to={card.link} className={cls} style={style}>{body}</Link>
    : <div className={cls} style={style}>{body}</div>;
}

// The cards for one place. `data` can be passed in (the admin's preview);
// otherwise it's fetched.
export default function PromoBanners({ place, data: given, className = '' }) {
  const [data, setData] = useState(given || null);
  useEffect(() => {
    if (given) { setData(given); return undefined; }
    let off = false;
    fetchPromos().then((d) => { if (!off) setData(d); }).catch(() => {});
    return () => { off = true; };
  }, [given]);

  const cards = promoCards(data, place);
  if (!cards.length) return null;
  return (
    <section aria-label="Offers" className={`grid gap-2 ${place === 'cart' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'} ${className}`}>
      {cards.map((card) => <PromoCard key={card.key} card={card} />)}
    </section>
  );
}
