import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Search, ShoppingBag } from 'lucide-react';
import { getCartCount, subscribeCart, openCartDrawer } from '@/lib/cartStore';
import { useAuth } from '@/lib/AuthContext';
import { SECTIONS, COLLECTIONS } from '@/lib/catalog';
import SearchOverlay from './SearchOverlay';
import logo from '@/assets/logo.png';

// Text-led navigation: section links on the left, the wordmark in the
// centre, utility links (search, account, bag) on the right. "Shop" opens a
// full-width menu panel on desktop and an accordion in the mobile sheet.
export default function Header() {
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { isAuthenticated, isAdmin, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const update = () => setCartCount(getCartCount());
    update();
    return subscribeCart(update);
  }, []);

  // Any navigation closes every panel.
  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const link = 'text-[13px] text-ink hover:underline underline-offset-4 decoration-1';

  return (
    <>
      <div className="bg-ink text-white text-[12px] text-center py-2 px-4">
        Delivery all over Bangladesh. Cash on delivery inside Dhaka.
      </div>

      <header
        className="sticky top-0 z-50 bg-white border-b border-rule"
        onMouseLeave={() => setMenuOpen(false)}
      >
        <div className="relative h-14 md:h-16 px-4 md:px-6 flex items-center justify-between">
          {/* Left */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Main">
            <button
              type="button"
              className={link}
              aria-expanded={menuOpen}
              onMouseEnter={() => setMenuOpen(true)}
              onClick={() => setMenuOpen((v) => !v)}
            >
              Shop
            </button>
            <Link to="/shop?filter=new_arrival" className={link}>New arrivals</Link>
            <Link to="/about" className={link}>About</Link>
          </nav>
          <button
            type="button"
            className="md:hidden -ml-1 p-1 text-ink"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} strokeWidth={1.5} />
          </button>

          {/* Centre */}
          <Link to="/" className="absolute left-1/2 -translate-x-1/2" aria-label="SUNDAY home">
            <img src={logo} alt="SUNDAY" className="h-6 md:h-7 w-auto" />
          </Link>

          {/* Right */}
          <div className="flex items-center gap-4 md:gap-7">
            <button type="button" className={`hidden md:inline ${link}`} onClick={() => setSearchOpen(true)}>
              Search
            </button>
            <button type="button" className="md:hidden p-1 text-ink" onClick={() => setSearchOpen(true)} aria-label="Search">
              <Search size={20} strokeWidth={1.5} />
            </button>
            {isAdmin && <Link to="/admin" className={`hidden md:inline ${link}`}>Admin</Link>}
            <Link to="/wishlist" className={`hidden md:inline ${link}`}>Wishlist</Link>
            {isAuthenticated ? (
              <button type="button" onClick={logout} className={`hidden md:inline ${link}`}>Log out</button>
            ) : (
              <Link to="/login" className={`hidden md:inline ${link}`}>Log in</Link>
            )}
            <button type="button" className={`hidden md:inline ${link}`} onClick={openCartDrawer}>
              Bag ({cartCount})
            </button>
            <button type="button" className="md:hidden relative p-1 text-ink" onClick={openCartDrawer} aria-label={`Bag, ${cartCount} items`}>
              <ShoppingBag size={20} strokeWidth={1.5} />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-1 min-w-4 h-4 px-1 rounded-full bg-coral text-white text-[10px] leading-4 text-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Desktop shop menu */}
        {menuOpen && (
          <div className="hidden md:block absolute inset-x-0 top-full bg-white border-b border-rule">
            <div className="px-6 py-8 grid grid-cols-[repeat(3,minmax(0,200px))] gap-10">
              <div>
                <p className="text-[12px] text-graphite mb-3">Clothing</p>
                <ul className="space-y-2">
                  <li><Link to="/shop" className={link}>View all</Link></li>
                  {SECTIONS.map((s) => (
                    <li key={s.key}><Link to={`/shop?category=${s.key}`} className={link}>{s.label}</Link></li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[12px] text-graphite mb-3">Collections</p>
                <ul className="space-y-2">
                  {COLLECTIONS.map((c) => (
                    <li key={c.key}><Link to={`/shop?filter=${c.key}`} className={link}>{c.label}</Link></li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[12px] text-graphite mb-3">Help</p>
                <ul className="space-y-2">
                  <li><Link to="/size-guide" className={link}>Size guide</Link></li>
                  <li><Link to="/order-tracking" className={link}>Track an order</Link></li>
                  <li><Link to="/contact" className={link}>Contact</Link></li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[90] bg-white flex flex-col">
          <div className="h-14 px-4 flex items-center justify-between border-b border-rule">
            <img src={logo} alt="SUNDAY" className="h-6 w-auto" />
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="p-1">
              <X size={22} strokeWidth={1.5} />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label="Mobile">
            <ul className="space-y-4 font-heading text-[26px] leading-tight">
              <li><Link to="/shop">Shop all</Link></li>
              {SECTIONS.map((s) => (
                <li key={s.key}><Link to={`/shop?category=${s.key}`}>{s.label}</Link></li>
              ))}
              {COLLECTIONS.map((c) => (
                <li key={c.key}><Link to={`/shop?filter=${c.key}`}>{c.label}</Link></li>
              ))}
              <li><Link to="/about">About</Link></li>
            </ul>
            <ul className="mt-10 space-y-3 text-[14px]">
              <li><Link to="/wishlist">Wishlist</Link></li>
              <li><Link to="/order-tracking">Track an order</Link></li>
              <li><Link to="/contact">Contact</Link></li>
              {isAdmin && <li><Link to="/admin">Admin</Link></li>}
              <li>
                {isAuthenticated
                  ? <button type="button" onClick={() => { setMobileOpen(false); logout(); }}>Log out</button>
                  : <Link to="/login">Log in</Link>}
              </li>
            </ul>
          </nav>
        </div>
      )}

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
