import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, X, ShoppingBag } from 'lucide-react';
import { getCart, updateCartItem, removeFromCart, subscribeCart } from '@/lib/cartStore';

export default function Cart() {
  const [cart, setCart] = useState(getCart());

  useEffect(() => {
    const unsub = subscribeCart(() => setCart(getCart()));
    return unsub;
  }, []);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  if (cart.length === 0) {
    return (
      <div className="pt-20 md:pt-24 min-h-screen flex flex-col items-center justify-center text-center px-5">
        <ShoppingBag size={40} strokeWidth={1} className="text-charcoal/20 mb-4" />
        <p className="text-charcoal/40 tracking-wider text-sm mb-6">Your bag is empty</p>
        <Link
          to="/shop"
          className="inline-block border border-obsidian text-obsidian text-[11px] tracking-[0.2em] uppercase px-10 py-4 hover:bg-obsidian hover:text-white transition-all duration-500"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-20 md:pt-24 min-h-screen">
      <div className="max-w-[1000px] mx-auto px-5 md:px-10 py-10 md:py-16">
        <h1 className="text-2xl md:text-3xl font-light tracking-wide mb-10">Your Bag</h1>

        <div className="space-y-6 mb-10">
          {cart.map(item => (
            <div key={`${item.productId}-${item.size}`} className="flex gap-4 border-b border-sand/20 pb-6">
              <img src={item.image} alt={item.name} className="w-20 h-24 object-cover bg-mist" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-1">{item.name}</p>
                <p className="text-xs text-charcoal/50 mb-3">Size: {item.size}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center border border-charcoal/20">
                    <button
                      onClick={() => updateCartItem(item.productId, item.size, item.quantity - 1)}
                      className="w-8 h-8 flex items-center justify-center"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="w-8 text-center text-sm font-mono">{item.quantity}</span>
                    <button
                      onClick={() => updateCartItem(item.productId, item.size, item.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <span className="text-sm font-mono font-medium">৳{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              </div>
              <button onClick={() => removeFromCart(item.productId, item.size)} className="text-charcoal/30 hover:text-red-500">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mb-8">
          <span className="text-lg font-medium">Subtotal</span>
          <span className="text-xl font-mono font-medium">৳{subtotal.toLocaleString()}</span>
        </div>

        <Link
          to="/checkout"
          className="block text-center bg-wine text-white text-[11px] tracking-[0.2em] uppercase py-4 hover:bg-wine/90 transition-colors"
        >
          Proceed to Checkout
        </Link>
      </div>
    </div>
  );
}
