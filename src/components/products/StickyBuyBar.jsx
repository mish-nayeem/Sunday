import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { imgUrl } from '@/lib/storage';
import { isSizeAvailable, formatPrice } from '@/lib/catalog';
import { RestockForm } from '@/components/products/ProductPanels';

// The product page's buying bar on a phone, floating at the bottom: the name
// and price, then the colour (left) and size (right) boxes, then ADD TO BAG.
//
// - Colour: the same design in its other colours (Admin: colour group). The
//   arrow opens them, small, over the left half; tapping one opens that
//   colour's page. Plain colour names (no group) are picked in place.
// - Size: opens over the right half, each with what's left ("Only 2 left",
//   or "Notify me" for a sold-out size, which asks for an email).
// - No other colours: one "Select size" box in the middle, which opens a
//   small row of sizes above it.
// Without a size picked, ADD TO BAG asks for one instead of adding.
// `hidden` slides it away (the page hides it once You may also like is up).
export default function StickyBuyBar({ product, buy, hidden }) {
  const [open, setOpen] = useState(''); // '' | 'colour' | 'size'
  const box = useRef(null);
  const onSale = !!product.compare_at;
  const sizes = product.sizes || [];
  const stock = product.size_stock || product.stock || {};
  const counted = Object.keys(stock).length > 0;
  const groupColours = buy.swatches.length > 1 ? buy.swatches : [];
  const nameColours = !groupColours.length && (product.colors || []).length > 1 ? product.colors : [];
  const hasColours = groupColours.length > 0 || nameColours.length > 0;

  // A new product, or the bar sliding away: close what's open.
  useEffect(() => { setOpen(''); }, [product.id, hidden]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(''); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  // Asked for a size: show the sizes.
  useEffect(() => { if (buy.sizeError) setOpen('size'); }, [buy.sizeError]);

  const note = (s) => {
    if (!isSizeAvailable(product, s)) return 'Notify me';
    if (!counted) return '';
    const left = Number(stock[s]) || 0;
    return left > 0 && left <= 3 ? `Only ${left} left` : '';
  };

  const pick = (s) => {
    buy.pickSize(s);
    if (isSizeAvailable(product, s)) setOpen('');
  };

  const colourLabel = groupColours.length ? (product.variant || 'Colour') : (buy.color || 'Colour');
  const sizeLabel = buy.size ? `Size ${buy.size}` : 'Select size';
  const cell = 'h-12 flex items-stretch border border-rule bg-white text-[13px] tracking-[0.04em]';
  const chevron = (which) => (open === which ? <ChevronUp size={16} strokeWidth={1.5} /> : <ChevronDown size={16} strokeWidth={1.5} />);

  const sizeList = (
    <ul className="max-h-[50vh] overflow-y-auto">
      {sizes.map((s) => {
        const ok = isSizeAvailable(product, s);
        const on = buy.size === s || buy.waitSize === s;
        return (
          <li key={s}>
            <button
              type="button"
              onClick={() => pick(s)}
              className={`w-full h-11 px-4 flex items-center justify-between text-left border-b border-rule last:border-b-0 ${on ? 'bg-stone' : 'hover:bg-stone/60'} ${ok ? '' : 'text-graphite'}`}
            >
              <span className={ok ? '' : 'line-through decoration-1'}>{s}</span>
              <span className={`text-[12px] ${ok ? 'text-graphite' : 'text-coral'}`}>{note(s)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      ref={box}
      aria-hidden={hidden || undefined}
      className={`md:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-rule px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${hidden ? 'translate-y-full pointer-events-none' : 'translate-y-0'}`}
    >
      {/* A sold-out size tapped: the email for when it's back. */}
      {buy.waitSize && (
        <div className="mb-3 border border-rule p-3 relative">
          <button type="button" onClick={buy.clearWait} aria-label="Close" className="absolute top-1 right-2 text-graphite text-[16px]">×</button>
          <p className="text-[12px] mb-1">Size {buy.waitSize} is sold out — we'll email you when it's back.</p>
          <RestockForm key={buy.waitSize} product={product} size={buy.waitSize} />
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <p className="text-[13px] tracking-[0.04em] truncate">{product.name}</p>
        <p className="text-[13px] shrink-0">
          {onSale && <span className="text-graphite line-through mr-1.5">{formatPrice(product.compare_at)}</span>}
          <span className={onSale ? 'text-coral' : ''}>{formatPrice(product.price)}</span>
        </p>
      </div>

      {sizes.length > 0 && (
        <div className={`relative mb-2.5 ${hasColours ? 'grid grid-cols-2 gap-3' : 'flex justify-center'}`}>
          {/* Colour: left half, opening upward over the left half. */}
          {hasColours && (
            <div className="relative">
              {open === 'colour' && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-rule shadow-lg max-h-[50vh] overflow-y-auto">
                  {groupColours.length > 0
                    ? groupColours.map((c) => (
                      <Link
                        key={c.id}
                        to={`/product/${c.id}`}
                        onClick={() => setOpen('')}
                        aria-current={c.id === product.id ? 'true' : undefined}
                        className={`flex items-center gap-3 px-3 py-2 border-b border-rule last:border-b-0 ${c.id === product.id ? 'bg-stone' : 'hover:bg-stone/60'}`}
                      >
                        <span className="w-9 h-11 shrink-0 bg-stone overflow-hidden">
                          {c.images?.[0] && <img src={imgUrl(c.images[0], 120)} alt="" className="w-full h-full object-cover" />}
                        </span>
                        <span className="text-[13px] truncate">{c.variant || c.name}</span>
                      </Link>
                    ))
                    : nameColours.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { buy.setColor(c); setOpen(''); }}
                        className={`w-full h-11 px-4 text-left text-[13px] border-b border-rule last:border-b-0 ${buy.color === c ? 'bg-stone' : 'hover:bg-stone/60'}`}
                      >
                        {c}
                      </button>
                    ))}
                </div>
              )}
              <button type="button" onClick={() => setOpen(open === 'colour' ? '' : 'colour')} aria-expanded={open === 'colour'} className={`${cell} w-full`}>
                <span className="flex-1 px-3 flex items-center truncate">{colourLabel}</span>
                <span className="w-11 border-l border-rule flex items-center justify-center">{chevron('colour')}</span>
              </button>
            </div>
          )}

          {/* Size: right half (or the middle), opening upward. */}
          <div className={`relative ${hasColours ? '' : 'w-[60%]'}`}>
            {open === 'size' && (
              hasColours ? (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-rule shadow-lg">{sizeList}</div>
              ) : (
                // One small row of sizes, centred above the box.
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white border border-rule shadow-lg flex">
                  {sizes.map((s) => {
                    const ok = isSizeAvailable(product, s);
                    const on = buy.size === s || buy.waitSize === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => pick(s)}
                        title={note(s) || undefined}
                        className={`min-w-[48px] h-11 px-3 text-[13px] border-r border-rule last:border-r-0 ${on ? 'bg-ink text-white' : ok ? 'hover:bg-stone' : 'text-graphite line-through decoration-1'}`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              )
            )}
            <button
              type="button"
              onClick={() => setOpen(open === 'size' ? '' : 'size')}
              aria-expanded={open === 'size'}
              className={`${cell} w-full ${buy.sizeError && !buy.size ? 'border-coral' : ''}`}
            >
              <span className={`flex-1 px-3 flex items-center truncate ${hasColours ? '' : 'justify-center'} ${buy.sizeError && !buy.size ? 'text-coral' : ''}`}>{sizeLabel}</span>
              <span className="w-11 border-l border-rule flex items-center justify-center">{chevron('size')}</span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={buy.add}
        className="w-full h-12 bg-ink text-white text-[13px] uppercase tracking-[0.14em] hover:bg-ink/85"
      >
        Add to bag
      </button>
    </div>
  );
}
