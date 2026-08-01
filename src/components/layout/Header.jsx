import React, { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X, Heart, ShoppingBag } from 'lucide-react';
import { getCartCount, subscribeCart } from '@/lib/cartStore';
import logo from '@/assets/logonayemsend.png';

const NAV_LINKS = [
  { to: '/shop', label: 'Shop' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export default function Header() {
  const [cartCount, setCartCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const update = () => setCartCount(getCartCount());
    update();
    const unsubscribe = subscribeCart(update);
    return unsubscribe;
  }, []);

  const navLinkClass = ({ isActive }) =>
    `uppercase tracking-[0.2em] text-xs transition-colors duration-300 hover:text-sand ${
      isActive ? 'text-sand' : 'text-obsidian'
    }`;

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-obsidian/10">
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src={logo} alt="SUNDAY" className="h-8 md:h-9 w-auto object-contain" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-10">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={navLinkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-4 md:gap-6">
          <Link
            to="/login"
            className="hidden md:inline-block uppercase tracking-[0.2em] text-xs text-obsidian hover:text-sand transition-colors duration-300"
          >
            Login
          </Link>
          <span className="hidden md:inline text-obsidian/20">|</span>
          <Link
            to="/faq"
            className="hidden md:inline-block uppercase tracking-[0.2em] text-xs text-obsidian hover:text-sand transition-colors duration-300"
          >
            Help
          </Link>
          <span className="hidden md:inline text-obsidian/20">|</span>
          <Link
            to="/wishlist"
            aria-label="Wishlist"
            className="text-obsidian hover:text-sand transition-colors duration-300"
          >
            <Heart size={19} strokeWidth={1.5} />
          </Link>
          <Link
            to="/cart"
            aria-label="Cart"
            className="relative text-obsidian hover:text-sand transition-colors duration-300"
          >
            <ShoppingBag size={19} strokeWidth={1.5} />
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-obsidian text-white text-[9px] flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-obsidian"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-obsidian/10 bg-white px-5 py-6 flex flex-col gap-5">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={navLinkClass}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
          <div className="h-px bg-obsidian/10" />
          <Link
            to="/login"
            className="uppercase tracking-[0.2em] text-xs text-obsidian"
            onClick={() => setMobileOpen(false)}
          >
            Login
          </Link>
          <Link
            to="/faq"
            className="uppercase tracking-[0.2em] text-xs text-obsidian"
            onClick={() => setMobileOpen(false)}
          >
            Help
          </Link>
        </div>
      )}
    </header>
  );
}
