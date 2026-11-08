import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { imgUrl } from '@/lib/storage';
import { useCountdown } from '@/admin/components/DropCountdown.jsx';
import {
  fetchCustomBanners, isLive, linkOf, loadFont, fontOf, safeColor, HEIGHTS, WIDTHS,
} from '@/admin/lib/customBanners.js';

// The banners designed in Admin → Website → Banners → Your banners: the
// words in their own colours and font (or an uploaded picture), a
// countdown, a coupon code to copy, and a click through to the products
// they're about.

function Timer({ to, label, color }) {
  const left = useCountdown(to);
  if (!left) return null;
  return (
    <span className="inline-flex items-center gap-2 text-[12px] tabular-nums" style={{ color }}>
      {label} <b className="text-[15px] tracking-wider">{left}</b>
    </span>
  );
}

function CopyCode({ code, color, border }) {
  const [done, setDone] = useState(false);
  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { await navigator.clipboard.writeText(code); } catch {
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
    <button type="button" onClick={copy}
      className="inline-flex items-center gap-2 h-10 px-3 border-2 border-dashed text-[13px] tracking-[0.12em]"
      style={{ color, borderColor: border }}>
      <span className="font-semibold">{code}</span>
      <span className="text-[11px] opacity-80">{done ? 'COPIED ✓' : 'COPY'}</span>
    </button>
  );
}

export function CustomBanner({ b, preview = false }) {
  useEffect(() => { loadFont(b.font); loadFont(b.textFont); }, [b.font, b.textFont]);
  const href = linkOf(b);
  const color = safeColor(b.color, '#FFFFFF');
  const accent = safeColor(b.accent, color);
  const bg = safeColor(b.bg, '#141414');
  const bg2 = safeColor(b.bg2, '');
  const timerTo = b.timerTo || b.ends_at;
  const align = b.align === 'left' ? 'items-start text-left' : b.align === 'right' ? 'items-end text-right' : 'items-center text-center';
  const radius = Math.max(0, Math.min(40, Number(b.radius) || 0));

  const extras = (b.timer && timerTo) || b.code ? (
    <div className={`flex flex-wrap gap-3 mt-3 ${b.align === 'left' ? 'justify-start' : b.align === 'right' ? 'justify-end' : 'justify-center'}`}>
      {b.timer && timerTo && <Timer to={timerTo} label={b.timerLabel || 'Ends in'} color={b.mode === 'image' ? '#fff' : color} />}
      {b.code && <CopyCode code={String(b.code).toUpperCase()} color={b.mode === 'image' ? '#fff' : color} border={b.mode === 'image' ? '#fff' : accent} />}
    </div>
  ) : null;

  let body;
  if (b.mode === 'image' && b.image) {
    body = (
      <div className="relative">
        <picture>
          {b.imagePhone && <source media="(max-width: 767px)" srcSet={imgUrl(b.imagePhone, 900)} />}
          <img src={imgUrl(b.image, 2000)} alt={b.alt || b.name || ''} className="block w-full h-auto" loading="lazy" />
        </picture>
        {extras && <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/55 to-transparent">{extras}</div>}
      </div>
    );
  } else {
    const h = (HEIGHTS.find((x) => x.key === b.height) || HEIGHTS[1]).px;
    body = (
      <div
        className={`flex flex-col justify-center ${align} px-5 md:px-10 py-5`}
        style={{ minHeight: h, color, background: bg2 ? `linear-gradient(120deg, ${bg}, ${bg2})` : bg, fontFamily: fontOf(b.textFont).css }}
      >
        {b.eyebrow && <span className="text-[11px] uppercase tracking-[0.2em] mb-1.5" style={{ color: accent }}>{b.eyebrow}</span>}
        {b.title && (
          <span className="leading-[1.05]" style={{ fontFamily: fontOf(b.font).css, fontSize: `clamp(20px, ${Math.max(14, Math.min(96, Number(b.titleSize) || 36)) / 16}rem, 9vw)` }}>
            {b.title}
          </span>
        )}
        {b.text && <span className="mt-2 text-[14px] opacity-90 max-w-xl">{b.text}</span>}
        {extras}
        {b.button && href && (
          <span className="mt-4 inline-block px-5 py-2.5 text-[12px] uppercase tracking-[0.14em] border" style={{ borderColor: accent, color: accent }}>
            {b.button}
          </span>
        )}
      </div>
    );
  }

  const cls = 'block overflow-hidden';
  const style = { borderRadius: radius };
  if (!href || preview) return <div className={cls} style={style}>{body}</div>;
  return href.startsWith('http')
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{body}</a>
    : <Link to={href} className={cls} style={style}>{body}</Link>;
}

// Every live banner for one place, in the admin's order. `list` can be
// passed in (the admin's preview); otherwise they're fetched.
export default function CustomBanners({ place, list: given, className = '' }) {
  // The bag's narrow column: always one under the other.
  const stack = place === 'cart';
  const [list, setList] = useState(given || null);
  useEffect(() => {
    if (given) { setList(given); return undefined; }
    let off = false;
    fetchCustomBanners().then(({ banners }) => { if (!off) setList(banners); }).catch(() => {});
    return () => { off = true; };
  }, [given]);
  const shown = (list || []).filter((b) => isLive(b) && (b.places || []).includes(place));
  if (!shown.length) return null;
  return (
    <section aria-label="Offers" className={`grid grid-cols-1 md:grid-cols-6 gap-2 ${className}`}>
      {shown.map((b) => (
        <div key={b.id} className={stack ? 'md:col-span-6' : (WIDTHS.find((w) => w.key === b.width) || WIDTHS[0]).cls}>
          <CustomBanner b={b} />
        </div>
      ))}
    </section>
  );
}
