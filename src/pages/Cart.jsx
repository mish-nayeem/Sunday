import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCart, updateCartItem, removeFromCart, subscribeCart } from '@/lib/cartStore';
import { imgUrl } from '@/lib/storage';
import { DELIVERY, formatPrice } from '@/lib/catalog';

export default function Cart() {
  const [cart, setCart] = useState(getCart());

  useEffect(() => subscribeCart(() => setCart(getCart())), []);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  if (cart.length === 0) {
    return (
      <div className="py-32 px-4 text-center">
        <h1 className="font-heading text-[32px] mb-3">Your bag is empty</h1>
        <Link to="/shop" className="inline-flex items-center h-12 px-8 bg-ink text-white text-[13px]">Shop all</Link>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 pt-8 md:pt-12 pb-20 md:grid md:grid-cols-[minmax(0,1fr)_360px] md:gap-12">
      <div>
        <h1 className="font-heading text-[32px] md:text-[44px] leading-none mb-8">Bag</h1>
        <ul className="border-t border-rule divide-y divide-rule">
          {cart.map((item) => (
            <li key={`${item.productId}-${item.size}`} className="flex gap-4 md:gap-6 py-5 text-[13px]">
              <Link to={`/product/${item.productId}`} className="w-24 md:w-32 shrink-0 aspect-[4/5] bg-stone">
                {item.image && <img src={imgUrl(item.image, 300)} alt="" className="w-full h-full object-cover" />}
              </Link>
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex justify-between gap-4">
                  <Link to={`/product/${item.productId}`} className="hover:underline underline-offset-2">{item.name}</Link>
                  <span className="shrink-0">{formatPrice(item.price * item.quantity)}</span>
                </div>
                <p className="text-graphite mt-0.5">Size {item.size}</p>
                <div className="mt-auto pt-3 flex items-center justify-between">
                  <div className="flex items-center border border-rule">
                    <button type="button" onClick={() => updateCartItem(item.productId, item.size, item.quantity - 1)} className="w-9 h-9" aria-label="Decrease quantity">−</button>
                    <span className="w-6 text-center">{item.quantity}</span>
                    <button type="button" onClick={() => updateCartItem(item.productId, item.size, item.quantity + 1)} className="w-9 h-9" aria-label="Increase quantity">+</button>
                  </div>
                  <button type="button" onClick={() => removeFromCart(item.productId, item.size)} className="text-graphite underline underline-offset-2 hover:text-ink">
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside className="mt-10 md:mt-[76px] md:sticky md:top-24 md:self-start border-t border-rule pt-5 text-[14px]">
        <div className="flex justify-between mb-1">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        <p className="text-[12px] text-graphite mb-5">Delivery is added at checkout: {formatPrice(DELIVERY.insideDhaka)} inside Dhaka, {formatPrice(DELIVERY.outsideDhaka)} outside.</p>
        <Link to="/checkout" className="h-12 w-full bg-ink text-white text-[13px] flex items-center justify-center hover:bg-ink/85">
          Checkout
        </Link>
        <Link to="/shop" className="block text-center mt-3 text-[13px] underline underline-offset-4">Continue shopping</Link>
      </aside>
    </div>
  );
}
