import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Search, User, ShoppingBag } from 'lucide-react';
import { getCartCount, subscribeCart, openCartDrawer } from '@/lib/cartStore';
import { useAuth } from '@/lib/AuthContext';
import { useMenus, dropLink } from '@/lib/menus';
import SearchOverlay from './SearchOverlay';
import logo from '@/assets/logo.png';

// The person icon: Log in when signed out; signed in, a panel that slides in
// from the right edge with the account's email, its shortcuts and Sign out.
function AccountMenu({ className }) {
  const { isAuthenticated, isAdmin, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  if (!isAuthenticated) {
    return (
      <Link to="/login" className={className} aria-label="Log in">
        <User size={21} strokeWidth={1.5} />
      </Link>
    );
  }

  const item = 'block w-full text-left px-6 py-3.5 hover:bg-stone transition-colors';
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label="Account">
        <User size={21} strokeWidth={1.5} />
        <span aria-hidden="true" className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-coral" />
      </button>
      {/* Always there, so it can slide: off to the right until opened. */}
      <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />
        <aside
          role="dialog"
          aria-label="Account"
          className={`absolute right-0 top-0 h-full w-[85%] max-w-[360px] bg-white text-ink text-[14px] shadow-xl flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-5 border-b border-rule">
            <p className="min-w-0">
              <span className="block text-[11px] uppercase tracking-[0.14em] text-graphite">Signed in as</span>
              <span className="block truncate mt-1">{user?.email}</span>
            </p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="-mr-2 -mt-1 p-2 text-ink">
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>
          <nav className="py-2">
            <Link to="/wishlist" className={item}>Wishlist</Link>
            <Link to="/order-tracking" className={item}>Track an order</Link>
            <Link to="/support/portal" className={item}>Returns and exchanges</Link>
            {isAdmin && <Link to="/admin" className={item}>Admin</Link>}
          </nav>
          <div className="border-t border-rule py-2">
            <button type="button" className={`${item} text-coral`} onClick={() => { setOpen(false); logout(); }}>
              Sign out
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

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
  // EXPLORE leaves out lookbooks the admin hid; the drops still shop.
  const lookKey = (d) => String(d).trim().replace(/\s+/g, ' ').toLowerCase();
  // EXPLORE: every row the admin shows — a drop's lookbook (unless that
  // lookbook is hidden), or any other page.
  const exploreItems = menus.explore.filter((m) => !(m.drop && m.to.startsWith('/lookbook/') && menus.lookHidden?.has(lookKey(m.drop))));
  const opts = menus.options || {};
  const links = opts.links || {};
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
            <AccountMenu className={`relative ${icon}`} />
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
          MEDIA (drops) — both set in Admin → Side menu. */}
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
          <div className="relative grid grid-cols-[1fr_1fr_auto] h-16 shrink-0" role="tablist">
            {[['shop', 'Shop'], ['explore', 'Media']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={menuTab === key}
                onClick={() => setMenuTab(key)}
                // The open tab in a dark cream, the other a pale one — unmistakably the one
                // chosen; the other stays light.
                className={`text-left px-5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${menuTab === key ? 'bg-[#D6C3A3] text-ink' : 'bg-[#EFE8DC] text-graphite hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="w-14 flex items-center justify-center bg-[#EFE8DC]">
              <X size={22} strokeWidth={1.25} />
            </button>
          </div>

          <nav className="relative flex-1 overflow-y-auto px-5 py-7" aria-label={menuTab === 'shop' ? 'Shop' : 'Media'}>
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
              {menuTab === 'shop' && opts.shopByCollection !== false && drops.length > 0 && (
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
              {/* EXPLORE: the rows set in Admin → Side menu. */}
              {menuTab === 'explore' && exploreItems.map((item) => (
                <li key={item.key}>
                  {/^https?:/.test(item.to)
                    ? <a href={item.to} target="_blank" rel="noreferrer" className="text-graphite hover:text-ink">{item.label}</a>
                    : <Link to={item.to} className="text-graphite hover:text-ink">{item.label}</Link>}
                </li>
              ))}
              {menuTab === 'explore' && exploreItems.length === 0 && (
                <li className="normal-case tracking-normal text-[13px] text-graphite">New lookbooks will show here.</li>
              )}
            </ul>

            <ul className="mt-12 pt-6 border-t border-black/10 space-y-3 text-[12px] text-graphite">
              {links.wishlist !== false && <li><Link to="/wishlist" className="hover:text-ink">Wishlist</Link></li>}
              {links.track !== false && <li><Link to="/order-tracking" className="hover:text-ink">Track an order</Link></li>}
              {links.returns !== false && <li><Link to="/support/portal" className="hover:text-ink">Returns and exchanges</Link></li>}
              {isAdmin && <li><Link to="/admin" className="hover:text-ink">Admin</Link></li>}
              <li>
                {isAuthenticated
                  ? <button type="button" className="hover:text-ink" onClick={() => { setMenuOpen(false); logout(); }}>Sign out</button>
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
