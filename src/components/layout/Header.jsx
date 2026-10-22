import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Search, User, ShoppingBag } from 'lucide-react';
import { getCartCount, subscribeCart, openCartDrawer } from '@/lib/cartStore';
import { useAuth } from '@/lib/AuthContext';
import { useMenus, dropLink, lookbookLink } from '@/lib/menus';
import SearchOverlay from './SearchOverlay';
import logo from '@/assets/logo.png';

// Menu icon on the left, the wordmark in the centre, search, account and bag
// icons on the right. On the homepage it sits see-through over the hero,
// with white icons, and turns solid
// once the hero has scrolled away. Everything else lives in the menu.
export default function Header() {
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState('shop');
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const location = useLocation();
  const menus = useMenus();
  const drops = menus.explore.filter((m) => m.drop);
  const isHome = location.pathname === '/';
  const overHero = isHome && !pastHero;

  useEffect(() => {
    const update = () => setCartCount(getCartCount());
    update();
    return subscribeCart(update);
  }, []);

  // The bag bounces when an added product lands in it (lib/flyToBag).
  const [bump, setBump] = useState(false);
  useEffect(() => {
    let t;
    const onLand = () => {
      setBump(false);
      requestAnimationFrame(() => setBump(true));
      clearTimeout(t);
      t = setTimeout(() => setBump(false), 600);
    };
    window.addEventListener('sunday:bag-landed', onLand);
    return () => { window.removeEventListener('sunday:bag-landed', onLand); clearTimeout(t); };
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
      <header
        className={`${isHome ? 'fixed inset-x-0' : 'sticky'} top-0 z-50 transition-colors duration-300 ${
          overHero ? 'bg-transparent' : 'bg-white border-b border-rule'
        }`}
      >
        <div className="relative h-14 md:h-16 px-3 md:px-5 flex items-center justify-between">
          <button type="button" className={`-ml-1.5 ${icon}`} onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={24} strokeWidth={0.9} />
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
            <button type="button" data-bag-icon className={`relative ${icon} ${bump ? 'bag-bump' : ''}`} onClick={openCartDrawer} aria-label={`Bag, ${cartCount} items`}>
              <ShoppingBag size={21} strokeWidth={1.5} />
              {cartCount > 0 && (
                <span className="absolute top-0 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-coral text-white text-[10px] leading-4 text-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

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
              {menuTab === 'shop' && menus.shop.map((item) => (
                <li key={item.key}>
                  {/^https?:/.test(item.to)
                    ? <a href={item.to} target="_blank" rel="noreferrer" className="text-graphite hover:text-ink">{item.label}</a>
                    : <Link to={item.to} className="text-graphite hover:text-ink">{item.label}</Link>}
                </li>
              ))}
              {/* Shop by collection: the drops, each opening its products in
                  the shop. Opens on hover with a mouse, on tap on a phone. */}
              {menuTab === 'shop' && drops.length > 0 && (
                <li onMouseEnter={() => setCollectionsOpen(true)} onMouseLeave={() => setCollectionsOpen(false)}>
                  <button
                    type="button"
                    // With a mouse, hover already opened it; a tap toggles it.
                    onClick={() => { if (!window.matchMedia('(hover: hover)').matches) setCollectionsOpen((v) => !v); }}
                    aria-expanded={collectionsOpen}
                    className="uppercase tracking-[0.12em] text-graphite hover:text-ink"
                  >
                    Shop by collection <span aria-hidden="true">{collectionsOpen ? '−' : '+'}</span>
                  </button>
                  {collectionsOpen && (
                    <ul className="mt-4 ml-3 pl-4 border-l border-burgundy/40 space-y-3">
                      {drops.map((d) => (
                        <li key={d.key}><Link to={dropLink(d.drop)} className="text-graphite hover:text-ink">{d.label}</Link></li>
                      ))}
                    </ul>
                  )}
                </li>
              )}
              {/* EXPLORE: the drops' lookbooks only. */}
              {menuTab === 'explore' && drops.map((d) => (
                <li key={d.key}><Link to={lookbookLink(d.drop)} className="text-graphite hover:text-ink">{d.label}</Link></li>
              ))}
              {menuTab === 'explore' && drops.length === 0 && (
                <li className="normal-case tracking-normal text-[13px] text-graphite">New lookbooks will show here.</li>
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
