import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, Heart, ShoppingBag, Search, UserCog, ChevronDown } from 'lucide-react';
import { getCartCount, subscribeCart } from '@/lib/cartStore';
import logo from '@/assets/logonayemsend.png';

const CATEGORY_LINKS = [
  { key: 'shirt', label: 'Shirt' },
  { key: 't_shirts', label: 'T-Shirt' },
  { key: 'polo', label: 'Polo' },
  { key: 'pant', label: 'Pant' },
];

const SHOP_LINKS = [
  { key: 'new_arrival', label: 'New Arrival' },
  { key: 'best_seller', label: 'Best Seller' },
  { key: 'featured', label: 'Featured Collection' },
];

export default function Header() {
  const [cartCount, setCartCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const searchInputRef = useRef(null);

  const navigate = useNavigate();

  useEffect(() => {
    const update = () => setCartCount(getCartCount());
    update();
    const unsubscribe = subscribeCart(update);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchValue.trim()) return;
    navigate(`/shop?search=${encodeURIComponent(searchValue.trim())}`);
    setSearchOpen(false);
    setSearchValue('');
  };

  // Navbar starts solid white at the top of the page, then becomes
  // transparent once the user scrolls down.
  const linkColor = 'text-obsidian';
  const linkHover = 'hover:text-sand';

  const navLinkClass = ({ isActive }) =>
    `uppercase tracking-[0.2em] text-xs transition-colors duration-300 ${linkHover} ${
      isActive ? 'text-sand' : linkColor
    }`;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-transparent shadow-none' : 'bg-white shadow-sm'
      }`}
    >
     <div className="max-w-[1440px] mx-auto px-6 md:px-12 h-[70px] md:h-[95px] grid grid-cols-3 items-center">
     
        {/* Left — Shop / Category / About */}
        <nav className="hidden md:flex items-center gap-12 lg:gap-16">
          <div
            className="relative"
            onMouseEnter={() => setShopOpen(true)}
            onMouseLeave={() => setShopOpen(false)}
          >
            <NavLink to="/shop" className={navLinkClass}>
              Shop
            </NavLink>
            {shopOpen && (
              <div className="absolute top-full left-0 pt-3 w-56">
                <div className="bg-white shadow-lg border border-obsidian/10 py-2">
                  {SHOP_LINKS.map((s) => (
                    <Link
                      key={s.key}
                      to={`/shop?filter=${s.key}`}
                      className="block px-4 py-2 text-xs uppercase tracking-wider text-obsidian hover:bg-mist hover:text-sand transition-colors duration-200"
                      onClick={() => setShopOpen(false)}
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div
            className="relative"
            onMouseEnter={() => setCategoryOpen(true)}
            onMouseLeave={() => setCategoryOpen(false)}
          >
            <button
              className={`flex items-center gap-1 uppercase tracking-[0.2em] text-xs transition-colors duration-300 ${linkColor} ${linkHover}`}
            >
              Category
              <ChevronDown size={13} />
            </button>
            {categoryOpen && (
              <div className="absolute top-full left-0 pt-3 w-52">
                <div className="bg-white shadow-lg border border-obsidian/10 py-2">
                  {CATEGORY_LINKS.map((c) => (
                    <Link
                      key={c.key}
                      to={`/shop?category=${c.key}`}
                      className="block px-4 py-2 text-xs uppercase tracking-wider text-obsidian hover:bg-mist hover:text-sand transition-colors duration-200"
                      onClick={() => setCategoryOpen(false)}
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <NavLink to="/about" className={navLinkClass}>
            About
          </NavLink>
        </nav>

        {/* Mobile menu toggle (left slot on mobile) */}
        <button
          className={`md:hidden justify-self-start ${linkColor}`}
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        {/* Center — Logo */}
        <Link to="/" className="justify-self-center flex items-center">
         <img src={logo} alt="SUNDAY" className="h-16 md:h-24 w-auto object-contain" />
        </Link>

        {/* Right — Search / Wishlist / Cart / Admin */}
        <div className="flex items-center justify-self-end gap-5 md:gap-7">
          <button
            aria-label="Search"
            onClick={() => setSearchOpen((v) => !v)}
            className={`transition-colors duration-300 ${linkColor} ${linkHover}`}
          >
            <Search size={19} strokeWidth={1.5} />
          </button>

          <Link
            to="/wishlist"
            aria-label="Wishlist"
            className={`hidden sm:inline-flex transition-colors duration-300 ${linkColor} ${linkHover}`}
          >
            <Heart size={19} strokeWidth={1.5} />
          </Link>

          <Link
            to="/cart"
            aria-label="Cart"
            className={`relative transition-colors duration-300 ${linkColor} ${linkHover}`}
          >
            <ShoppingBag size={19} strokeWidth={1.5} />
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-sand text-white text-[9px] flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>

          <Link
            to="/admin"
            aria-label="Admin"
            className={`hidden sm:inline-flex transition-colors duration-300 ${linkColor} ${linkHover}`}
          >
            <UserCog size={19} strokeWidth={1.5} />
          </Link>
        </div>
      </div>

      {/* Expandable search bar */}
      {searchOpen && (
        <div className="border-t border-obsidian/10 bg-white/95 backdrop-blur-sm">
          <form
            onSubmit={handleSearchSubmit}
            className="max-w-[1440px] mx-auto px-5 md:px-10 py-4 flex items-center gap-3"
          >
            <Search size={16} className="text-obsidian/50" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search products..."
              className="flex-1 bg-transparent outline-none text-sm text-obsidian placeholder-obsidian/40"
            />
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="text-obsidian"
              aria-label="Close search"
            >
              <X size={18} />
            </button>
          </form>
        </div>
      )}

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-obsidian/10 bg-white px-5 py-6 flex flex-col gap-5">
          <div>
            <NavLink to="/shop" className={({ isActive }) => `uppercase tracking-[0.2em] text-xs ${isActive ? 'text-sand' : 'text-obsidian'}`} onClick={() => setMobileOpen(false)}>
              Shop
            </NavLink>
            <div className="flex flex-col gap-3 pl-3 mt-3">
              {SHOP_LINKS.map((s) => (
                <Link
                  key={s.key}
                  to={`/shop?filter=${s.key}`}
                  className="text-xs uppercase tracking-wider text-obsidian/70"
                  onClick={() => setMobileOpen(false)}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="uppercase tracking-[0.2em] text-xs text-obsidian mb-3">Category</p>
            <div className="flex flex-col gap-3 pl-3">
              {CATEGORY_LINKS.map((c) => (
                <Link
                  key={c.key}
                  to={`/shop?category=${c.key}`}
                  className="text-xs uppercase tracking-wider text-obsidian/70"
                  onClick={() => setMobileOpen(false)}
                >
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
          <NavLink to="/about" className={({ isActive }) => `uppercase tracking-[0.2em] text-xs ${isActive ? 'text-sand' : 'text-obsidian'}`} onClick={() => setMobileOpen(false)}>
            About
          </NavLink>
          <div className="h-px bg-obsidian/10" />
          <Link to="/wishlist" className="uppercase tracking-[0.2em] text-xs text-obsidian" onClick={() => setMobileOpen(false)}>
            Wishlist
          </Link>
          <Link to="/admin" className="uppercase tracking-[0.2em] text-xs text-obsidian" onClick={() => setMobileOpen(false)}>
            Admin
          </Link>
        </div>
      )}
    </header>
  );
}
