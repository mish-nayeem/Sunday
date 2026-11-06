import React, { useEffect, useRef, useState } from 'react';
import { addToCart, openCartDrawer } from '@/lib/cartStore';
import { flyToBag } from '@/lib/flyToBag';
import { imgUrl } from '@/lib/storage';
import { isSizeAvailable } from '@/lib/catalog';
import { useCornerTone } from '@/lib/imageTone';

// The + in the bottom-right corner of a product photo on the grid: adds to
// the bag without opening the product. One size → straight in. Otherwise a
// row of every size opens along the bottom of the photo, the ones out of
// stock struck through and not tappable. It sits on top of the card's link,
// so every tap here stops the link from opening the product. Black + on a
// light photo, white on a dark one.
export default function QuickAdd({ product }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const ref = useRef(null);
  const sizes = product.sizes || [];
  const left = sizes.filter((s) => isSizeAvailable(product, s));
  const tone = useCornerTone(product.images?.[0]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  if (left.length === 0) return null;

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  function add(e, size) {
    stop(e);
    setOpen(false);
    addToCart(product, size, 1);
    setNote('Added ✓');
    setTimeout(() => setNote(''), 1500);
    const photo = ref.current?.closest('.group')?.querySelector('img');
    flyToBag(photo, product.images?.[0] && imgUrl(product.images[0], 300)).then(openCartDrawer);
  }

  const plusColour = tone === 'dark' ? 'text-white' : tone === 'light' ? 'text-ink' : 'text-white mix-blend-difference';

  return (
    <div ref={ref} onClick={stop} className="absolute inset-x-0 bottom-0 z-[3] flex items-end justify-end gap-1.5 p-2 pointer-events-none">
      {open && (
        <div role="group" aria-label={`Add ${product.name} — pick a size`} className="pointer-events-auto mr-auto flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {sizes.map((s) => {
            const ok = left.includes(s);
            return (
              <button
                key={s}
                type="button"
                disabled={!ok}
                onClick={(e) => ok && add(e, s)}
                aria-label={ok ? `Add size ${s}` : `${s} — sold out`}
                className="shrink-0 min-w-[30px] h-8 px-2 bg-white text-ink text-[11px] tracking-[0.04em] shadow-sm hover:bg-ink hover:text-white disabled:opacity-45 disabled:line-through disabled:hover:bg-white disabled:hover:text-ink disabled:cursor-not-allowed"
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
      {note && <span className="pointer-events-none self-center text-[10.5px] tracking-[0.06em] text-white bg-ink/80 px-2 py-1.5">{note}</span>}
      <button
        type="button"
        aria-label={sizes.length <= 1 ? `Add ${product.name} to bag` : `Add ${product.name} to bag — choose a size`}
        aria-expanded={sizes.length > 1 ? open : undefined}
        onClick={(e) => {
          stop(e);
          if (sizes.length <= 1) add(e, left[0]);
          else setOpen((o) => !o);
        }}
        className={`pointer-events-auto shrink-0 w-8 h-8 grid place-items-center ${plusColour} transition-transform hover:scale-110`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className={`transition-transform ${open ? 'rotate-45' : ''}`}>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
