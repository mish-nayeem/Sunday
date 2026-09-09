import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, X, Lock } from 'lucide-react';
import {
  getCart,
  subscribeCart,
  subscribeCartDrawer,
  closeCartDrawer,
  updateCartItem,
  removeFromCart,
} from '@/lib/cartStore';

export default function CartDrawer() {
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState(getCart());

  useEffect(() => {
    const unsubDrawer = subscribeCartDrawer(setOpen);
    const unsubCart = subscribeCart(() => setCart(getCart()));
    return () => {
      unsubDrawer();
      unsubCart();
    };
  }, []);

  // Lock background scroll while the drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-10 md:pt-20 px-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={closeCartDrawer}
      />

      {/* Panel */}
      <div className="relative bg-[#FFFBEA] w-full max-w-[620px] rounded-[10px] shadow-xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 md:px-8 pt-6 md:pt-8 pb-5">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-medium text-black">Cart</h2>
            <span className="w-6 h-6 rounded-full bg-[#FF7254] text-white text-xs flex items-center justify-center">
              {count}
            </span>
          </div>
          <button onClick={closeCartDrawer} aria-label="Close cart" className="text-black hover:text-[#FF7254]">
            <X size={22} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 md:px-8">
          {cart.length === 0 ? (
            <p className="text-black/50 text-sm py-10 text-center">Your bag is empty</p>
          ) : (
            <div className="divide-y divide-black/10">
              {cart.map((item) => (
                <div key={`${item.productId}-${item.size}`} className="flex gap-4 py-5">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-20 h-24 object-cover bg-white rounded-[6px]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium mb-1 truncate text-black">{item.name}</p>
                    <p className="text-sm text-black/60 mb-1">৳{item.price.toLocaleString()}.00</p>
                    <p className="text-sm text-black/50">{item.size}</p>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <div className="flex items-center border border-[#FF7254]/40 rounded-[6px]">
                      <button
                        onClick={() => updateCartItem(item.productId, item.size, item.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center text-black hover:text-[#FF7254]"
                      >
                        <Minus size={11} />
                      </button>
                      <span className="w-6 text-center text-sm font-mono text-black">{item.quantity}</span>
                      <button
                        onClick={() => updateCartItem(item.productId, item.size, item.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center text-black hover:text-[#FF7254]"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.productId, item.size)}
                      className="text-xs underline text-black/60 hover:text-[#FF7254]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="px-6 md:px-8 pt-5 pb-6 md:pb-8 border-t border-black/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-medium text-black">Total</span>
              <span className="text-lg font-medium font-mono text-black">৳{total.toLocaleString()}.00 BDT</span>
            </div>
            <p className="text-sm text-black/50 mb-6">
              Taxes and <Link to="/checkout" className="underline hover:text-[#FF7254]" onClick={closeCartDrawer}>shipping</Link> calculated at checkout
            </p>
            <div className="flex gap-3">
              <Link
                to="/cart"
                onClick={closeCartDrawer}
                className="flex-1 text-center bg-[#FFDCCB] text-black font-medium py-4 rounded-[6px] border border-[#FF7254]/30 hover:bg-[#FFCBB3] transition-colors"
              >
                View cart
              </Link>
              <Link
                to="/checkout"
                onClick={closeCartDrawer}
                className="flex-1 flex items-center justify-center gap-2 bg-[#FF7254] text-white font-medium py-4 rounded-[6px] hover:bg-[#FF7254]/90 transition-colors"
              >
                <Lock size={15} />
                Checkout
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
