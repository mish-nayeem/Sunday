import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { imgUrl } from '@/lib/storage';
import { focusStyle, focusZoom } from '@/lib/focus';
import QuickAdd from './QuickAdd';
import { isSoldOut, formatPrice } from '@/lib/catalog';
import { useLiveSales, withSale } from '@/lib/pricing';

// Grid tile: photo on a quiet ground, name left and price right underneath
// (sizes only on the product page). Hovering on a computer slowly runs
// through its photos; on a phone a swipe does, with a dot for each photo.
// The + in the photo's corner adds to the bag.
// `colours` (optional): the other colours of the same piece (colour group),
// shown as small swatches under the price.
export default function ProductCard({ product: raw, colours = [] }) {
  const product = withSale(raw, useLiveSales());
  // Hover slideshow. `slide` fades in on top of `under`, which stays fully
  // shown beneath it, so there's never a blank frame between photos; the
  // next photo is loaded before it's switched to.
  const [slide, setSlide] = useState(0);
  const [under, setUnder] = useState(0);
  const [hovered, setHovered] = useState(false);
  const timer = useRef(null);
  const showing = useRef(0);
  // `byHand`: a swipe on a phone — shown whether or not a slideshow runs.
  const go = (next, byHand = false) => {
    const src = imgUrl(images[next], Math.min(2000, Math.round(600 * focusZoom(product.image_focus?.[images[next]]))));
    const pre = new Image();
    pre.src = src;
    (pre.decode ? pre.decode() : Promise.resolve()).catch(() => {}).then(() => {
      if (!byHand && !timer.current && next !== 0) return; // pointer left meanwhile
      setUnder(showing.current);
      setSlide(next);
      showing.current = next;
    });
  };
  const startSlides = () => {
    if (images.length < 2 || timer.current) return;
    setHovered(true);
    timer.current = setInterval(() => go((showing.current + 1) % images.length), 1800);
    go(1);
  };
  const stopSlides = () => {
    clearInterval(timer.current);
    timer.current = null;
    if (showing.current !== 0) go(0);
  };
  useEffect(() => () => clearInterval(timer.current), []);

  // Phones: swipe the photo left or right for the next or the last one (as
  // on PAUSE); an up/down drag is left to the page (touch-action: pan-y). A
  // swipe never opens the product — only a tap does.
  const touch = useRef(null);
  const swiped = useRef(false);
  const onTouchStart = (e) => {
    if (images.length < 2 || e.touches.length !== 1) return;
    setHovered(true); // the other photos start loading
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() };
    swiped.current = false;
  };
  const onTouchEnd = (e) => {
    const t0 = touch.current;
    touch.current = null;
    if (!t0) return;
    const dx = e.changedTouches[0].clientX - t0.x;
    const dy = e.changedTouches[0].clientY - t0.y;
    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy)) return;
    swiped.current = true;
    const quick = Math.abs(dx) / Math.max(1, performance.now() - t0.t) > 0.35;
    if (Math.abs(dx) < 30 && !quick) return;
    const n = images.length;
    go((showing.current + (dx < 0 ? 1 : n - 1)) % n, true);
  };
  const onClickPhoto = (e) => {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
  };
  const images = (product.images || []).filter(Boolean);
  const soldOut = isSoldOut(product);
  const onSale = !!product.compare_at;
  const colorCount = product.colors?.length || 0;


  return (
    <div className="group">
      <div className="relative aspect-[4/5] bg-stone overflow-hidden">
        <Link
          to={`/product/${product.id}`}
          className="absolute inset-0 overflow-hidden touch-pan-y"
          tabIndex={-1}
          aria-hidden="true"
          onMouseEnter={startSlides}
          onMouseLeave={stopSlides}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => { touch.current = null; }}
          onClick={onClickPhoto}
        >
          {/* While the pointer rests on the photo, the product's photos cross-
              fade one after another, slowly: the new one on top, the last one
              still showing underneath. Other photos load on first hover. */}
          {images.map((src, i) => (i === 0 || hovered) && (
            <img
              key={src}
              src={imgUrl(src, Math.min(2000, Math.round(600 * focusZoom(product.image_focus?.[src]))))}
              alt={i === 0 ? product.name : ''}
              loading={i === 0 ? 'lazy' : 'eager'}
              decoding="async"
              style={product.image_focus?.[src] ? focusStyle(product.image_focus[src]) : undefined}
              className={`absolute inset-0 w-full h-full object-cover ${
                i === slide ? 'z-[2] opacity-100 transition-opacity duration-700' : i === under ? 'z-[1] opacity-100' : 'z-0 opacity-0'
              }`}
            />
          ))}
        </Link>

        {/* Which photo is showing, on a phone (where there's no hover):
            a small dot each, so a swipe has something to say. */}
        {images.length > 1 && (
          <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 z-[3] flex gap-1 [@media(hover:hover)]:hidden" aria-hidden="true" data-card-dots>
            {images.map((src, i) => (
              <i key={src} className={`block w-[5px] h-[5px] rounded-full shadow-[0_0_2px_rgba(0,0,0,0.45)] transition-colors ${i === slide ? 'bg-white' : 'bg-white/45'}`} />
            ))}
          </span>
        )}

        {product.sale ? (
          <span className="pointer-events-none absolute top-2 left-2 text-[11px] bg-coral text-white px-1.5 py-0.5">{product.sale.percent}% off</span>
        ) : product.is_new_arrival && !soldOut && (
          <span className="pointer-events-none absolute top-2 left-2 text-[11px] bg-white px-1.5 py-0.5">New</span>
        )}

        {/* + on the photo's corner: tap for the sizes, tap one to add it
            to the bag — on a phone too. */}
        {!soldOut && product.sizes?.length > 0 && <QuickAdd product={product} />}
      </div>

      <Link to={`/product/${product.id}`} className="block pt-3 pb-1 text-[12px] leading-snug">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-body font-normal min-w-0 group-hover:underline underline-offset-2 decoration-1">{product.name}</h3>
          <p className="shrink-0 tabular-nums">
            {onSale && <span className="text-graphite line-through mr-1.5">{formatPrice(product.compare_at)}</span>}
            <span className={onSale ? 'text-coral' : ''}>{formatPrice(product.price)}</span>
          </p>
        </div>
        {soldOut ? (
          <p className="text-graphite mt-0.5">Sold out</p>
        ) : (
          <>
            {colorCount > 1 && colours.length === 0 && <p className="text-graphite mt-0.5">{colorCount} colours</p>}
          </>
        )}
      </Link>
      {colours.length > 0 && (
        <div className="flex gap-1.5 pt-1">
          {[product, ...colours].map((c) => (
            <Link
              key={c.id}
              to={`/product/${c.id}`}
              title={c.variant || c.name}
              aria-label={c.variant || c.name}
              aria-current={c.id === product.id ? 'true' : undefined}
              className={`w-6 h-6 p-px border ${c.id === product.id ? 'border-ink' : 'border-rule hover:border-graphite'}`}
            >
              <span className="block w-full h-full bg-stone overflow-hidden">
                {c.images?.[0] && <img src={imgUrl(c.images[0], 60)} alt="" loading="lazy" className="w-full h-full object-cover" />}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
