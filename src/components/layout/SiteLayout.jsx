import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import WhatsAppButton from './WhatsAppButton';
import CartDrawer from './CartDrawer';
import OrderTrackPopup from './OrderTrackPopup';

export default function SiteLayout() {
  // Header is now `fixed`, so it no longer reserves space in normal flow.
  // The homepage hero sits full-bleed behind the transparent header on load,
  // so it needs no offset. Every other page needs top padding equal to the
  // header height (h-20 = 5rem) so content isn't hidden underneath it.
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className={`flex-1 ${isHome ? '' : 'pt-20'}`}>
        <Outlet />
      </main>
      <Footer />
      <WhatsAppButton />
      <CartDrawer />
      <OrderTrackPopup />
    </div>
  );
}
