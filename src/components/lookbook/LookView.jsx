import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { imgUrl } from '@/lib/storage';
import { addToCart, openCartDrawer } from '@/lib/cartStore';
import { flyToBag } from '@/lib/flyToBag';
import { isSizeAvailable, isSoldOut, formatPrice } from '@/lib/catalog';
import { useLiveSales, withSale } from '@/lib/pricing';

const WIDE = '(min-width: 1024px)';

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

// Name, colour, price and the words about a piece.
function Details({ product, index, count }) {
  const onSale = !!product.compare_at;
  const text = [product.description, product.details, product.care_instructions].filter(Boolean).join('\n\n');
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-graphite mb-3">Piece {index + 1} of {count}</p>
      <h2 className="font-heading text-[26px] leading-tight">{product.name}</h2>
      {product.variant && <p className="text-[14px] text-graphite mt-1">{product.variant}</p>}
      <p className="mt-2 text-[15px]">
        {onSale && <span className="text-graphite line-through mr-2">{formatPrice(product.compare_at)}</span>}
        <span className={onSale ? 'text-coral' : ''}>{formatPrice(product.price)}</span>
      </p>
      {text && <p className="mt-5 text-[13px] leading-relaxed text-graphite whitespace-pre-line">{text}</p>}
      <Link to={`/product/${product.id}`} className="inline-block mt-5 text-[12px] underline underline-offset-4">
        Full product page
      </Link>
    </div>
  );
}

// Size and add to bag for one piece.
function BuyBox({ product }) {
  const [size, setSize] = useState('');
  const [error, setError] = useState(false);
  const buttonRef = useRef(null);
  const soldOut = isSoldOut(product);

  useEffect(() => {
    setError(false);
    setSize(product.sizes?.length === 1 && isSizeAvailable(product, product.sizes[0]) ? product.sizes[0] : '');
  }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    if (!size) return setError(true);
    addToCart(product, size, 1);
    // From the piece's photo on screen, else the button itself.
    const photo = document.querySelector(`[data-piece="${product.id}"] img`);
    flyToBag(photo || buttonRef.current, product.images?.[0] && imgUrl(product.images[0], 300)).then(openCartDrawer);
  };

  return (
    <div>
      <p className="text-[13px] mb-2">{error ? <span className="text-coral">Choose a size</span> : 'Size'}</p>
      <div className="flex flex-wrap gap-2">
        {(product.sizes || []).map((s) => {
          const ok = isSizeAvailable(product, s);
          return (
            <button
              key={s}
              type="button"
              disabled={!ok}
              aria-pressed={size === s}
              onClick={() => { setSize(s); setError(false); }}
              className={`min-w-12 h-10 px-3 text-[13px] border ${size === s ? 'border-ink bg-ink text-white' : 'border-rule hover:border-ink'} disabled:text-graphite/50 disabled:line-through disabled:hover:border-rule`}
            >
              {s}
            </button>
          );
        })}
      </div>
      <button
        ref={buttonRef}
        type="button"
        onClick={add}
        disabled={soldOut}
        className="mt-4 w-full h-12 bg-ink text-white text-[13px] disabled:bg-graphite/40"
      >
        {soldOut ? 'Sold out' : 'Add to bag'}
      </button>
    </div>
  );
}

// One look from a lookbook, shoppable. On a computer: the look's photo, then
// each piece's photos, down the middle; the left column shows the piece in
// view — scroll from the shirt to the belt and it changes — and the right
// column adds that piece to the bag. On a phone each piece's details and
// sizes follow its photos.
export default function LookView({ look, items: rawItems, drop }) {
  const sales = useLiveSales();
  const items = rawItems.map((p) => withSale(p, sales));
  const wide = useWide();
  const [active, setActive] = useState(-1); // -1: the look photo itself
  const blocks = useRef(new Map()); // index → element (-1: the look photo)

  useEffect(() => {
    setActive(-1);
    const els = [...blocks.current.values()];
    if (!els.length) return;
    // The block crossing the middle of the screen is the one in view.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(Number(e.target.dataset.index));
        });
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [look.id, items.length]);

  const jumpTo = (i) => {
    blocks.current.get(i)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const current = active >= 0 ? items[active] : null;
  const block = (index) => (el) => {
    if (el) blocks.current.set(index, el);
    else blocks.current.delete(index);
  };

  const pieceList = (
    <ul className="space-y-2 text-[13px]">
      {items.map((p, i) => (
        <li key={p.id}>
          <button type="button" onClick={() => jumpTo(i)} className="w-full flex justify-between gap-3 text-left hover:underline underline-offset-4">
            <span className="min-w-0 truncate">{p.name}</span>
            <span className="shrink-0 text-graphite">{formatPrice(p.price)}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,300px)] lg:gap-10">
      {wide && (
        <aside className="sticky top-36 self-start pt-2">
          {current ? (
            <Details product={current} index={active} count={items.length} />
          ) : (
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-graphite mb-3">{drop}</p>
              <h2 className="font-heading text-[26px] leading-tight">{look.title || 'The look'}</h2>
              {items.length > 0 && (
                <>
                  <p className="mt-5 mb-3 text-[11px] uppercase tracking-[0.16em] text-graphite">In this look</p>
                  {pieceList}
                </>
              )}
            </div>
          )}
        </aside>
      )}

      <div className="space-y-3">
        <div ref={block(-1)} data-index={-1} className="mx-auto max-w-[620px]">
          <div className="aspect-[4/5] bg-stone overflow-hidden">
            <img src={imgUrl(look.image_url, 1400)} alt={look.title || `${drop} look`} className="w-full h-full object-cover" style={{ objectPosition: look.focus || 'center' }} />
          </div>
          {!wide && look.title && <p className="pt-3 text-center text-[13px]">{look.title}</p>}
        </div>

        {items.map((p, i) => (
          <div key={p.id} ref={block(i)} data-index={i} data-piece={p.id} className="mx-auto max-w-[620px] pt-6 lg:pt-10">
            <div className="space-y-3">
              {(p.images || []).filter(Boolean).slice(0, 2).map((src, k) => (
                <div key={src} className="aspect-[4/5] bg-stone overflow-hidden">
                  <img src={imgUrl(src, 1200)} alt={k === 0 ? p.name : ''} loading="lazy" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            {!wide && (
              <div className="pt-5 pb-4 space-y-5">
                <Details product={p} index={i} count={items.length} />
                <BuyBox product={p} />
              </div>
            )}
          </div>
        ))}
      </div>

      {wide && (
        <aside className="sticky top-36 self-start pt-2">
          {current ? (
            <BuyBox product={current} />
          ) : items.length > 0 ? (
            <div>
              <p className="text-[13px] leading-relaxed text-graphite">Scroll down through the pieces — each one’s details show on the left, and you can add it to your bag here.</p>
              <button type="button" onClick={() => jumpTo(0)} className="mt-4 w-full h-12 border border-ink text-[13px] hover:bg-ink hover:text-white transition-colors">
                Shop the look
              </button>
            </div>
          ) : null}
        </aside>
      )}
    </div>
  );
}
