import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Search, User, ShoppingBag } from 'lucide-react';
import { getCartCount, subscribeCart, openCartDrawer } from '@/lib/cartStore';
import { useAuth } from '@/lib/AuthContext';
import { COLLECTIONS } from '@/lib/catalog';
import { useMenus } from '@/lib/menus';
import { fetchTicker } from '@/admin/lib/siteSettings.js';
import SearchOverlay from './SearchOverlay';
import logo from '@/assets/logo.png';

// "Dhaka, BD | Tuesday, October 20, 2026 | 15:56 BST", kept to the minute.
function useDhakaClock() {
  const make = () => {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { timeZone: 'Asia/Dhaka', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const time = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' });
    return `Dhaka, BD | ${day} | ${time} BST`;
  };
  const [text, setText] = useState(make);
  useEffect(() => {
    const t = setInterval(() => setText(make()), 15000);
    return () => clearInterval(t);
  }, []);
  return text;
}

// Menu icon on the left, the wordmark in the centre, search, account and bag
// icons on the right. On the homepage it sits see-through over the hero,
// in white, with the Dhaka date and time under the logo, and turns solid
// once the hero has scrolled away. Everything else lives in the menu.
export default function Header() {
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const location = useLocation();
  const menus = useMenus();
  const [ticker, setTicker] = useState([]);
  const [line, setLine] = useState(0);
  const clock = useDhakaClock();
  const isHome = location.pathname === '/';
  const overHero = isHome && !pastHero;

  // The strip's lines come from Admin → Homepage → Ticker.
  useEffect(() => {
    fetchTicker().then(setTicker).catch(() => {});
  }, []);
  useEffect(() => {
    if (ticker.length < 2) return;
    const t = setInterval(() => setLine((n) => (n + 1) % ticker.length), 4000);
    return () => clearInterval(t);
  }, [ticker.length]);

  useEffect(() => {
    const update = () => setCartCount(getCartCount());
    update();
    return subscribeCart(update);
  }, []);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setPastHero(window.scrollY > window.innerHeight - 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  // Any navigation closes every panel.
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const tone = overHero ? 'text-white' : 'text-ink';
  const icon = `p-1.5 ${tone}`;

  return (
    <>
      {!isHome && (
        <div className="bg-ink text-white text-[12px] text-center py-2 px-4" aria-live="polite">
          {ticker[line] || 'Delivery all over Bangladesh. Cash on delivery inside Dhaka.'}
        </div>
      )}

      <header
        className={`${isHome ? 'fixed inset-x-0' : 'sticky'} top-0 z-50 transition-colors duration-300 ${
          overHero ? 'bg-transparent' : 'bg-white border-b border-rule'
        }`}
      >
        <div className="relative h-14 md:h-16 px-3 md:px-5 flex items-center justify-between">
          <button type="button" className={`-ml-1.5 ${icon}`} onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={24} strokeWidth={1.25} />
          </button>

          <Link to="/" className="absolute left-1/2 -translate-x-1/2" aria-label="SUNDAY home">
            <img src={logo} alt="SUNDAY" className={`h-6 md:h-7 w-auto ${overHero ? 'brightness-0 invert' : ''}`} />
          </Link>

          <div className="flex items-center gap-1 md:gap-3 -mr-1.5">
            <button type="button" className={icon} onClick={() => setSearchOpen(true)} aria-label="Search">
              <Search size={21} strokeWidth={1.5} />
            </button>
            <Link to={isAdmin ? '/admin' : isAuthenticated ? '/wishlist' : '/login'} className={icon} aria-label={isAuthenticated ? 'Account' : 'Log in'}>
              <User size={21} strokeWidth={1.5} />
            </Link>
            <button type="button" className={`relative ${icon}`} onClick={openCartDrawer} aria-label={`Bag, ${cartCount} items`}>
              <ShoppingBag size={21} strokeWidth={1.5} />
              {cartCount > 0 && (
                <span className="absolute top-0 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-coral text-white text-[10px] leading-4 text-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {overHero && (
          <p className="text-center text-white text-[10px] md:text-[11px] font-semibold tracking-wide -mt-1 px-4 tabular-nums" aria-hidden="true">
            {clock}
          </p>
        )}
      </header>

      {/* Menu: slides in from the left on every screen */}
      {menuOpen && (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-full max-w-[420px] bg-white flex flex-col">
            <div className="h-14 md:h-16 px-4 md:px-6 flex items-center justify-between border-b border-rule">
              <img src={logo} alt="SUNDAY" className="h-6 w-auto" />
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="p-1">
                <X size={22} strokeWidth={1.5} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 md:px-6 py-6" aria-label="Main">
              <ul className="space-y-3 font-heading text-[26px] leading-tight">
                <li><Link to="/shop">Shop all</Link></li>
                <li><Link to="/shop?filter=new_arrival">New arrivals</Link></li>
                {menus.shop.map((s) => (
                  <li key={s.key}><Link to={s.to}>{s.label}</Link></li>
                ))}
              </ul>
              {menus.drops.length > 0 && (
                <>
                  <p className="mt-8 mb-2 text-[12px] text-graphite">Drops</p>
                  <ul className="space-y-2 text-[15px]">
                    {menus.drops.map((d) => (
                      <li key={`drop-${d.key}`}><Link to={d.to}>{d.label}</Link></li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-8 mb-2 text-[12px] text-graphite">Collections</p>
              <ul className="space-y-2 text-[15px]">
                {COLLECTIONS.map((c) => (
                  <li key={c.key}><Link to={`/shop?filter=${c.key}`}>{c.label}</Link></li>
                ))}
                <li><Link to="/about">About</Link></li>
              </ul>
              <p className="mt-8 mb-2 text-[12px] text-graphite">Help</p>
              <ul className="space-y-2 text-[14px]">
                <li><Link to="/support/size-guide">Size guide</Link></li>
                <li><Link to="/support/portal">Returns and exchanges</Link></li>
                <li><Link to="/order-tracking">Track an order</Link></li>
                <li><Link to="/contact">Contact</Link></li>
              </ul>
              <ul className="mt-8 pt-6 border-t border-rule space-y-2 text-[14px]">
                <li><Link to="/wishlist">Wishlist</Link></li>
                {isAdmin && <li><Link to="/admin">Admin</Link></li>}
                <li>
                  {isAuthenticated
                    ? <button type="button" onClick={() => { setMenuOpen(false); logout(); }}>Log out</button>
                    : <Link to="/login">Log in</Link>}
                </li>
              </ul>
            </nav>
          </aside>
        </div>
      )}

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
