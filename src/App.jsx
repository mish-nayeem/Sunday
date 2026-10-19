import { Toaster } from "@/components/ui/toaster"
import { Suspense, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import PageViewTracker from './components/PageViewTracker';

import SiteLayout from '@/components/layout/SiteLayout';
import Home from '@/pages/Home';
import ProtectedRoute from '@/components/ProtectedRoute';

// Every page except Home loads on demand, so the first visit downloads only
// what the home page needs. The admin panel in particular never reaches a
// normal shopper — its heavy libraries (PDF export, charts, drag-and-drop,
// rich text editor) load only if/when someone navigates to /admin.
const Shop = lazy(() => import('@/pages/Shop'));
const ProductDetail = lazy(() => import('@/pages/ProductDetail'));
const Checkout = lazy(() => import('@/pages/Checkout'));
const Cart = lazy(() => import('@/pages/Cart'));
const OrderConfirmation = lazy(() => import('@/pages/OrderConfirmation'));
const About = lazy(() => import('@/pages/About'));
const Contact = lazy(() => import('@/pages/Contact'));
const OrderTracking = lazy(() => import('@/pages/OrderTracking'));
const FAQ = lazy(() => import('@/pages/FAQ'));
const Wishlist = lazy(() => import('@/pages/Wishlist'));
const Lookbook = lazy(() => import('@/pages/Lookbook'));
const Support = lazy(() => import('@/pages/Support'));
const Admin = lazy(() => import('@/admin/pages/Admin'));
// The previous panel, kept for Expenses, Invoices, Bulk upload and Store
// settings until those move into the new one.
const AdminClassic = lazy(() => import('@/pages/Admin'));
const Login = lazy(() => import('@/pages/Login'));

const RouteFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-white">
    <div className="w-6 h-6 border-2 border-sand border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-2xl font-black tracking-[0.15em] text-obsidian mb-4">SUNDAY</p>
          <div className="w-6 h-6 border-2 border-sand border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/order-confirmation/:orderId" element={<OrderConfirmation />} />
          <Route path="/about" element={<About />} />
          <Route path="/size-guide" element={<Navigate to="/support/size-guide" replace />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/order-tracking" element={<OrderTracking />} />
          <Route path="/faq" element={<FAQ />} />
          {/* The policy pages live under /support now, editable from the admin panel. */}
          <Route path="/privacy" element={<Navigate to="/support/privacy" replace />} />
          <Route path="/terms" element={<Navigate to="/support/terms" replace />} />
          <Route path="/refund-policy" element={<Navigate to="/support/refunds" replace />} />
          <Route path="/support" element={<Support />} />
          <Route path="/support/:slug" element={<Support />} />
          <Route path="/lookbook/:drop" element={<Lookbook />} />
          <Route path="/wishlist" element={<Wishlist />} />
        </Route>
        <Route path="/login" element={<Login />} />
        {/* Passwords are gone: one-time codes on /login open accounts too. */}
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
        <Route path="/reset-password" element={<Navigate to="/login" replace />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin-classic" element={<AdminClassic />} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <PageViewTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
