import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { imgUrl } from '@/lib/storage';
import { formatPrice } from '@/lib/catalog';
import {
  getCart,
  subscribeCart,
  subscribeCartDrawer,
  closeCartDrawer,
  updateCartItem,
  removeFromCart,
} from '@/lib/cartStore';
import AddOneMore, { useBagCatalog } from '@/components/cart/AddOneMore';

// The bag: a box just under the header on the right, like the account box,
// that slides in from the right edge whenever
// something is added or the header's bag is tapped — the pieces, the
// subtotal and Checkout — so shoppers never leave the page they're on.
export default function CartDrawer() {
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState(getCart());
  const [asking, setAsking] = useState(''); // the line whose + is asking for a size

  useEffect(() => {
    const unsubDrawer = subscribeCartDrawer(setOpen);
    const unsubCart = subscribeCart(() => setCart(getCart()));
    return () => { unsubDrawer(); unsubCart(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && closeCartDrawer();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const catalog = useBagCatalog(cart, open);
  useEffect(() => { if (!open) setAsking(''); }, [open]);

  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div
      className={`fixed inset-0 z-[100] ${open ? '' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Bag"
      aria-hidden={!open}
      {...(!open && { inert: '' })}
    >
      <div
        className={`absolute inset-0 bg-black/10 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={closeCartDrawer}
      />
      <aside
        className={`absolute right-3 top-14 md:top-16 w-[calc(100%-1.5rem)] max-w-[380px] max-h-[calc(100dvh-5rem)] bg-white border border-rule shadow-lg flex flex-col transition-all duration-300 ease-out ${
          open ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+1rem)] opacity-0'
        }`}
      >
        <div className="h-12 px-4 flex items-center justify-between border-b border-rule shrink-0">
          <p className="text-[14px]">Bag ({count})</p>
          <button type="button" onClick={closeCartDrawer} aria-label="Close bag" className="p-1">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <p className="text-[15px] mb-4">Your bag is empty.</p>
            <Link to="/shop" onClick={closeCartDrawer} className="h-12 px-8 bg-ink text-white text-[13px] inline-flex items-center">
              Shop all
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 min-h-0 overflow-y-auto px-4 divide-y divide-rule">
              {cart.map((item) => {
                const key = `${item.productId}-${item.size}`;
                const product = catalog.get(item.productId);
                return (
                <li key={key} className="flex gap-3 py-4">
                  <Link to={`/product/${item.productId}`} onClick={closeCartDrawer} className="w-16 shrink-0 aspect-[4/5] bg-stone">
                    {item.image && <img src={imgUrl(item.image, 200)} alt="" className="w-full h-full object-cover" />}
                  </Link>
                  <div className="flex-1 min-w-0 text-[13px] flex flex-col">
                    <div className="flex justify-between gap-3">
                      <Link to={`/product/${item.productId}`} onClick={closeCartDrawer} className="hover:underline underline-offset-2">
                        {item.name}
                      </Link>
                      <span className="shrink-0">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                    <p className="text-graphite mt-0.5">Size {item.size}</p>
                    <div className="mt-auto pt-3 flex items-center justify-between">
                      <div className="flex items-center border border-rule">
                        <button
                          type="button"
                          onClick={() => updateCartItem(item.productId, item.size, item.quantity - 1)}
                          className="w-8 h-8"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="w-6 text-center" aria-live="polite">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setAsking(asking === key ? '' : key)}
                          className={`w-8 h-8 ${asking === key ? 'bg-ink text-white' : ''}`}
                          aria-label="Add one more"
                          aria-expanded={asking === key}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.productId, item.size)}
                        className="text-graphite underline underline-offset-2 hover:text-ink"
                      >
                        Remove
                      </button>
                    </div>
                    {asking === key && <AddOneMore item={item} product={product} onDone={() => setAsking('')} />}
                  </div>
                </li>
                );
              })}
            </ul>

            <div className="px-4 pt-3 pb-4 border-t border-rule shrink-0">
              <div className="flex justify-between text-[14px] mb-1">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <p className="text-[12px] text-graphite mb-3">Delivery is added at checkout.</p>
              <Link
                to="/checkout"
                onClick={closeCartDrawer}
                className="h-12 w-full bg-ink text-white text-[13px] flex items-center justify-center hover:bg-ink/85"
              >
                Checkout
              </Link>
              <Link
                to="/cart"
                onClick={closeCartDrawer}
                className="block text-center mt-3 text-[13px] underline underline-offset-4"
              >
                View bag
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
