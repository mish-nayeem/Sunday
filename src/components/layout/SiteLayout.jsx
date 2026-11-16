import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import WhatsAppButton from './WhatsAppButton';
import CartDrawer from './CartDrawer';
import { PAGE_META, applyPageMeta, shopMeta } from '@/lib/pageMeta';

export default function SiteLayout() {
  // The header is sticky (it keeps its place in the flow), so pages need
  // no top offset of their own.
  const { pathname, search } = useLocation();
  // The fixed pages' title, description and canonical address (products,
  // lookbooks and support pages set their own).
  useEffect(() => {
    const path = pathname.replace(/\/+$/, '') || '/';
    const meta = path === '/shop' ? shopMeta(search) : PAGE_META[path];
    if (meta) applyPageMeta(meta.title, meta.description);
  }, [pathname, search]);
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {/* Keyed on the path so each new page fades in (.page-in); filters on
          the same page don't. */}
      <main key={pathname} className="flex-1 page-in">
        <Outlet />
      </main>
      <Footer />
      <WhatsAppButton />
      <CartDrawer />
    </div>
  );
}
