import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Search, User, ShoppingBag } from 'lucide-react';
import { getCartCount, subscribeCart, openCartDrawer } from '@/lib/cartStore';
import { useAuth } from '@/lib/AuthContext';
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
  const [menuTab, setMenuTab] = useState('shop');
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
            <img src={logo} alt="SUNDAY" className="h-6 md:h-7 w-auto" />
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

      {/* Menu: slides in from the left on every screen. Two tabs — SHOP and
          EXPLORE (drops) — both set in Admin → Side menu. */}
      <div
        className={`fixed inset-0 z-[90] ${menuOpen ? '' : 'pointer-events-none'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!menuOpen}
      >
        <div
          className={`absolute inset-0 bg-black/25 transition-opacity duration-300 ${menuOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMenuOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-full max-w-[450px] bg-[#F6F1E7] text-ink flex flex-col overflow-hidden transition-transform duration-300 ease-out ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <img src={logo} alt="" aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] opacity-[0.05] grayscale" />
          <div className="relative grid grid-cols-[1fr_1fr_auto] h-16 shrink-0" role="tablist">
            {[['shop', 'Shop'], ['explore', 'Explore']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={menuTab === key}
                onClick={() => setMenuTab(key)}
                className={`text-left px-5 text-[11px] font-semibold uppercase tracking-[0.12em] ${menuTab === key ? 'text-ink' : 'bg-[#EAE2D3] text-graphite hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="w-14 flex items-center justify-center bg-[#EAE2D3]">
              <X size={22} strokeWidth={1.25} />
            </button>
          </div>

          <nav className="relative flex-1 overflow-y-auto px-5 py-7" aria-label={menuTab === 'shop' ? 'Shop' : 'Explore'}>
            <ul
              className="space-y-[18px] text-[11px] uppercase tracking-[0.12em]"
              // EXPLORE's links sit under the EXPLORE tab, the way SHOP's sit under SHOP.
              style={menuTab === 'explore' ? { paddingLeft: 'calc((100% - 16px) / 2)' } : undefined}
            >
              {(menuTab === 'shop' ? menus.shop : menus.explore).map((item) => (
                <li key={item.key}>
                  {/^https?:/.test(item.to)
                    ? <a href={item.to} target="_blank" rel="noreferrer" className="text-graphite hover:text-ink">{item.label}</a>
                    : <Link to={item.to} className="text-graphite hover:text-ink">{item.label}</Link>}
                </li>
              ))}
              {menuTab === 'explore' && menus.explore.length === 0 && (
                <li className="normal-case tracking-normal text-[13px] text-graphite">New drops will show here.</li>
              )}
            </ul>

            <ul className="mt-12 pt-6 border-t border-black/10 space-y-3 text-[12px] text-graphite">
              <li><Link to="/wishlist" className="hover:text-ink">Wishlist</Link></li>
              <li><Link to="/order-tracking" className="hover:text-ink">Track an order</Link></li>
              <li><Link to="/support/portal" className="hover:text-ink">Returns and exchanges</Link></li>
              {isAdmin && <li><Link to="/admin" className="hover:text-ink">Admin</Link></li>}
              <li>
                {isAuthenticated
                  ? <button type="button" className="hover:text-ink" onClick={() => { setMenuOpen(false); logout(); }}>Log out</button>
                  : <Link to="/login" className="hover:text-ink">Log in</Link>}
              </li>
            </ul>
          </nav>
        </aside>
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
