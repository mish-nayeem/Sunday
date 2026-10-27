import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { imgUrl } from '@/lib/storage';
import { addToCart, openCartDrawer } from '@/lib/cartStore';
import { flyToBag } from '@/lib/flyToBag';
import { isSizeAvailable, isSoldOut, formatPrice } from '@/lib/catalog';
import { useLiveSales, withSale } from '@/lib/pricing';

// Grid tile: photo on a quiet ground, name left and price right underneath
// (sizes only on the product page). Hovering on a computer slowly runs
// through its photos and shows a row of sizes that add straight to the bag.
// `colours` (optional): the other colours of the same piece (colour group),
// shown as small swatches under the price.
export default function ProductCard({ product: raw, colours = [] }) {
  const product = withSale(raw, useLiveSales());
  const [added, setAdded] = useState('');
  // Hover slideshow. `slide` fades in on top of `under`, which stays fully
  // shown beneath it, so there's never a blank frame between photos; the
  // next photo is loaded before it's switched to.
  const [slide, setSlide] = useState(0);
  const [under, setUnder] = useState(0);
  const [hovered, setHovered] = useState(false);
  const timer = useRef(null);
  const showing = useRef(0);
  const go = (next) => {
    const src = imgUrl(images[next], 600);
    const pre = new Image();
    pre.src = src;
    (pre.decode ? pre.decode() : Promise.resolve()).catch(() => {}).then(() => {
      if (!timer.current && next !== 0) return; // pointer left meanwhile
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
  const images = (product.images || []).filter(Boolean);
  const soldOut = isSoldOut(product);
  const onSale = !!product.compare_at;
  const colorCount = product.colors?.length || 0;

  const quickAdd = (e, size) => {
    e.preventDefault();
    addToCart(product, size, 1);
    setAdded(size);
    flyToBag(e.currentTarget.closest('.group')?.querySelector('img'), images[0] && imgUrl(images[0], 300)).then(openCartDrawer);
    setTimeout(() => setAdded(''), 1500);
  };

  return (
    <div className="group">
      <div className="relative aspect-[4/5] bg-stone overflow-hidden">
        <Link
          to={`/product/${product.id}`}
          className="absolute inset-0"
          tabIndex={-1}
          aria-hidden="true"
          onMouseEnter={startSlides}
          onMouseLeave={stopSlides}
        >
          {/* While the pointer rests on the photo, the product's photos cross-
              fade one after another, slowly: the new one on top, the last one
              still showing underneath. Other photos load on first hover. */}
          {images.map((src, i) => (i === 0 || hovered) && (
            <img
              key={src}
              src={imgUrl(src, 600)}
              alt={i === 0 ? product.name : ''}
              loading={i === 0 ? 'lazy' : 'eager'}
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover ${
                i === slide ? 'z-[2] opacity-100 transition-opacity duration-700' : i === under ? 'z-[1] opacity-100' : 'z-0 opacity-0'
              }`}
            />
          ))}
        </Link>

        {product.sale ? (
          <span className="pointer-events-none absolute top-2 left-2 text-[11px] bg-coral text-white px-1.5 py-0.5">{product.sale.percent}% off</span>
        ) : product.is_new_arrival && !soldOut && (
          <span className="pointer-events-none absolute top-2 left-2 text-[11px] bg-white px-1.5 py-0.5">New</span>
        )}

        {!soldOut && product.sizes?.length > 0 && (
          <div className="hidden md:block absolute inset-x-2 bottom-2 bg-white px-3 py-2 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 focus-within:opacity-100 focus-within:translate-y-0 transition duration-200">
            <p className="text-[11px] text-graphite mb-1">{added ? `Added ${added} to bag` : 'Quick add'}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {product.sizes.map((size) => {
                const ok = isSizeAvailable(product, size);
                return (
                  <button
                    key={size}
                    type="button"
                    disabled={!ok}
                    onClick={(e) => quickAdd(e, size)}
                    className="text-[12px] hover:underline underline-offset-2 disabled:text-graphite/50 disabled:line-through disabled:no-underline"
                    aria-label={`Add size ${size} to bag`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
