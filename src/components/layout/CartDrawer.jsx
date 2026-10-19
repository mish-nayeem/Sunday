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

// The bag slides in from the right whenever something is added or the
// header's bag link is used, so shoppers never leave the page they're on.
export default function CartDrawer() {
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState(getCart());

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
        className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={closeCartDrawer}
      />
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-[420px] bg-white flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-14 md:h-16 px-5 flex items-center justify-between border-b border-rule shrink-0">
          <p className="text-[14px]">Bag ({count})</p>
          <button type="button" onClick={closeCartDrawer} aria-label="Close bag" className="p-1">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-5 text-center">
            <p className="text-[15px] mb-4">Your bag is empty.</p>
            <Link to="/shop" onClick={closeCartDrawer} className="h-12 px-8 bg-ink text-white text-[13px] inline-flex items-center">
              Shop all
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-5 divide-y divide-rule">
              {cart.map((item) => (
                <li key={`${item.productId}-${item.size}`} className="flex gap-4 py-5">
                  <Link to={`/product/${item.productId}`} onClick={closeCartDrawer} className="w-20 shrink-0 aspect-[4/5] bg-stone">
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
                          onClick={() => updateCartItem(item.productId, item.size, item.quantity + 1)}
                          className="w-8 h-8"
                          aria-label="Increase quantity"
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
                  </div>
                </li>
              ))}
            </ul>

            <div className="px-5 pt-4 pb-5 border-t border-rule shrink-0">
              <div className="flex justify-between text-[14px] mb-1">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <p className="text-[12px] text-graphite mb-4">Delivery is added at checkout.</p>
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
