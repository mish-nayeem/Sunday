import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { imgUrl } from '@/lib/storage';
import { formatPrice } from '@/lib/catalog';
import { getCartCount } from '@/lib/cartStore';

// "Item added to cart", rising from the bottom of a phone after Add to bag
// on the product page: the piece (photo, name, colour / size, price), then
// VIEW CART (n) and CHECKOUT. ✕, the dimmed page or Esc closes it.
export default function AddedSheet({ added, onClose }) {
  const open = !!added;
  // Kept while it slides away, so the content doesn't vanish mid-slide.
  const [shown, setShown] = useState(added);
  useEffect(() => { if (added) setShown(added); }, [added]);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);

  const p = shown?.product;
  const photo = p?.images?.find(Boolean);
  const detail = [p?.variant, shown?.size].filter(Boolean).join(' / ');
  return (
    <div className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <div
        role="dialog"
        aria-label="Item added to cart"
        className={`absolute inset-x-0 bottom-0 bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] uppercase tracking-[0.08em]">Item added to cart</p>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 -mr-1"><X size={20} strokeWidth={1.25} /></button>
        </div>
        {p && (
          <div className="flex gap-4 items-center mb-4">
            <div className="w-16 aspect-[4/5] bg-stone shrink-0 overflow-hidden">
              {photo && <img src={imgUrl(photo, 300)} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 text-[13px]">
              <p className="leading-snug">{p.name}</p>
              {detail && <p className="mt-1 text-[12px] uppercase text-graphite/70">{detail}</p>}
              <p className="mt-1">{formatPrice(p.price)}</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Link to="/cart" onClick={onClose} className="h-10 border border-ink flex items-center justify-center text-[11px] uppercase tracking-[0.06em]">
            View cart ({open ? getCartCount() : 0})
          </Link>
          <Link to="/checkout" onClick={onClose} className="h-10 bg-ink text-white flex items-center justify-center text-[11px] uppercase tracking-[0.06em]">
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
