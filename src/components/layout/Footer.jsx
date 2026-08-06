import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Facebook, Instagram } from 'lucide-react';

// Simple inline icons for platforms lucide-react doesn't ship (TikTok, Pinterest)
const TikTokIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18} {...props}>
    <path d="M16.6 5.82c-1.1-1.02-1.72-2.46-1.72-4.02h-3.14v13.44c0 1.6-1.3 2.9-2.9 2.9a2.9 2.9 0 0 1 0-5.8c.27 0 .53.04.78.1V9.4a6.06 6.06 0 0 0-.78-.05A6.06 6.06 0 1 0 14.9 15.4V9.03a7.24 7.24 0 0 0 4.24 1.36V7.26c-1.13 0-2.18-.36-3.04-.98l-.5-.46z" />
  </svg>
);

const PinterestIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18} {...props}>
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.16 9.43 7.63 11.17-.1-.95-.2-2.4.04-3.44.22-.94 1.41-5.97 1.41-5.97s-.36-.72-.36-1.78c0-1.67.97-2.91 2.17-2.91 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-.99 4-.29 1.19.6 2.17 1.78 2.17 2.13 0 3.77-2.25 3.77-5.5 0-2.87-2.06-4.88-5.01-4.88-3.42 0-5.42 2.56-5.42 5.21 0 1.03.4 2.14.9 2.74.1.12.11.22.08.34l-.33 1.36c-.05.22-.17.27-.4.16-1.5-.7-2.44-2.89-2.44-4.65 0-3.78 2.75-7.26 7.93-7.26 4.16 0 7.4 2.97 7.4 6.93 0 4.14-2.61 7.47-6.23 7.47-1.22 0-2.36-.63-2.75-1.38l-.75 2.85c-.27 1.04-1 2.35-1.49 3.15A12 12 0 1 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

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
    <footer className="bg-obsidian text-white pt-14 pb-6 px-5 md:px-10">
      <div className="max-w-[1440px] mx-auto">

        {/* Newsletter */}
        <p className="text-sm md:text-base font-bold tracking-[0.1em] uppercase mb-4">
          Join Sunday Fam
        </p>
        {subscribed ? (
          <p className="text-sm text-white/60 mb-12">Thanks for subscribing!</p>
        ) : (
          <form onSubmit={handleSubscribe} className="flex border border-white/30 mb-12 max-w-2xl">
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              className="flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder-white/50"
            />
            <button type="submit" className="bg-white text-obsidian px-6 text-xs uppercase tracking-[0.15em] font-semibold whitespace-nowrap">
              Join Sunday Fam
            </button>
          </form>
        )}

        {/* Statement + Link columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-16">
          <div>
            <p className="text-[11px] tracking-[0.15em] uppercase text-white/50 mb-3">Premium Menswear</p>
            <p className="text-sm text-white/60 leading-relaxed max-w-sm">
              Have the courage to be exactly who you are. Every day feels like SUNDAY —
              premium men's fashion crafted for Bangladesh.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
            <div>
              <p className="text-[11px] tracking-[0.15em] uppercase mb-4 text-white/80">Shop</p>
              <div className="space-y-2 text-sm text-white/60">
                <Link to="/shop" className="block hover:text-white">All Products</Link>
                <Link to="/wishlist" className="block hover:text-white">Wishlist</Link>
                <Link to="/order-tracking" className="block hover:text-white">Track Order</Link>
              </div>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.15em] uppercase mb-4 text-white/80">Support</p>
              <div className="space-y-2 text-sm text-white/60">
                <Link to="/contact" className="block hover:text-white">Contact Us</Link>
                <Link to="/faq" className="block hover:text-white">FAQ</Link>
                <Link to="/size-guide" className="block hover:text-white">Size Guide</Link>
              </div>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.15em] uppercase mb-4 text-white/80">Legal</p>
              <div className="space-y-2 text-sm text-white/60">
                <Link to="/privacy" className="block hover:text-white">Privacy Policy</Link>
                <Link to="/terms" className="block hover:text-white">Terms</Link>
              </div>
            </div>
          </div>
        </div>

        {/* Social icons — icons only, no labels */}
        <div className="flex items-center gap-5 mb-8">
          <a href="https://www.instagram.com/sunday.clothin?igsh=MWhyZzNpZzNod2xsZQ==" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-white/70 hover:text-white transition-colors">
            <Instagram size={18} />
          </a>
          <a href="https://www.facebook.com/share/19U1FfCwMY/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-white/70 hover:text-white transition-colors">
            <Facebook size={18} />
          </a>
          <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="text-white/70 hover:text-white transition-colors">
            <TikTokIcon />
          </a>
          <a href="https://pinterest.com" target="_blank" rel="noopener noreferrer" aria-label="Pinterest" className="text-white/70 hover:text-white transition-colors">
            <PinterestIcon />
          </a>
        </div>

        {/* Big wordmark */}
        <p className="text-[18vw] md:text-[10vw] leading-[0.85] font-black tracking-tight select-none overflow-hidden whitespace-nowrap -mx-1">
          SUNDAY
        </p>

        <div className="border-t border-white/10 mt-6 pt-6 text-center text-xs text-white/40">
          © {new Date().getFullYear()} SUNDAY. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
