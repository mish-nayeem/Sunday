import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Facebook, Instagram } from 'lucide-react';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    await supabase.from('newsletter_subscribers').insert({ email: email.trim() });
    setSubscribed(true);
    setEmail('');
  };

  return (
    <footer className="bg-obsidian text-white pt-16 pb-8 px-5 md:px-10">
      <div className="max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          <div>
            <p className="text-lg font-black tracking-[0.15em] mb-3">SUNDAY</p>
            <p className="text-sm text-white/50">Premium men's fashion for Bangladesh.</p>
            <div className="flex gap-3 mt-4">
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer"><Facebook size={18} /></a>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer"><Instagram size={18} /></a>
            </div>
          </div>
          <div>
            <p className="text-[11px] tracking-[0.15em] uppercase mb-4">Shop</p>
            <div className="space-y-2 text-sm text-white/60">
              <Link to="/shop" className="block hover:text-white">All Products</Link>
              <Link to="/wishlist" className="block hover:text-white">Wishlist</Link>
              <Link to="/order-tracking" className="block hover:text-white">Track Order</Link>
            </div>
          </div>
          <div>
            <p className="text-[11px] tracking-[0.15em] uppercase mb-4">Support</p>
            <div className="space-y-2 text-sm text-white/60">
              <Link to="/contact" className="block hover:text-white">Contact Us</Link>
              <Link to="/faq" className="block hover:text-white">FAQ</Link>
              <Link to="/size-guide" className="block hover:text-white">Size Guide</Link>
              <Link to="/privacy" className="block hover:text-white">Privacy Policy</Link>
              <Link to="/terms" className="block hover:text-white">Terms</Link>
            </div>
          </div>
          <div>
            <p className="text-[11px] tracking-[0.15em] uppercase mb-4">Newsletter</p>
            {subscribed ? (
              <p className="text-sm text-white/60">Thanks for subscribing!</p>
            ) : (
              <form onSubmit={handleSubscribe} className="flex">
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Your email"
                  className="flex-1 bg-transparent border border-white/20 px-3 py-2 text-sm outline-none"
                />
                <button type="submit" className="bg-white text-obsidian px-4 text-sm">Join</button>
              </form>
            )}
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 text-center text-xs text-white/40">
          © {new Date().getFullYear()} SUNDAY. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
