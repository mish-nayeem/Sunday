import React, { useState, useEffect } from 'react';
import { X, Package, Search, CheckCircle2, Truck, Clock, XCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';

const statusSteps = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
const statusIcons = {
  pending: Clock,
  confirmed: CheckCircle2,
  processing: Package,
  shipped: Truck,
  delivered: CheckCircle2,
  cancelled: XCircle,
  returned: XCircle,
};

// Floating bottom-left widget. Collapsed = small "Track Your Order" pill (like a
// promo popup). Clicking it expands into an inline order-ID/mobile lookup form,
// right there — no page navigation needed. The X always fully dismisses it for
// the session; customers can still reach /order-tracking via the footer link.
export default function OrderTrackPopup() {
  const [dismissed, setDismissed] = useState(true); // start hidden until we check sessionStorage
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const hidden = sessionStorage.getItem('sunday_track_popup_dismissed');
    if (!hidden) {
      const t = setTimeout(() => setDismissed(false), 1200); // small delay so it doesn't flash on load
      return () => clearTimeout(t);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('sunday_track_popup_dismissed', '1');
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setNotFound(false);
    setOrder(null);

    const trimmed = query.trim();
    const looksLikeOrderId = trimmed.toUpperCase().startsWith('SND-');

    const { data } = await supabase.rpc('track_order', {
      p_order_id: looksLikeOrderId ? trimmed.toUpperCase() : null,
      p_mobile: looksLikeOrderId ? null : trimmed,
    });

    if (data && data.length > 0) {
      setOrder(data[0]);
    } else {
      setNotFound(true);
    }
    setSearching(false);
  };

  const reset = () => {
    setOrder(null);
    setNotFound(false);
    setQuery('');
  };

  const currentStepIndex = order ? statusSteps.indexOf(order.status) : -1;

  if (dismissed) return null;

  return (
    <div className="fixed bottom-6 left-6 z-40 max-w-[300px]">
      <AnimatePresence mode="wait">
        {!expanded ? (
          // Collapsed pill
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setExpanded(true)}
            className="relative bg-charcoal text-white rounded-xl shadow-xl px-5 py-4 flex items-center gap-3 text-left hover:bg-charcoal/90 transition-colors"
          >
            <span
              onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
              role="button"
              aria-label="Dismiss"
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white text-charcoal flex items-center justify-center shadow hover:bg-mist"
            >
              <X size={13} />
            </span>
            <Package size={20} className="text-sand shrink-0" />
            <span>
              <span className="block text-[10px] tracking-[0.15em] uppercase text-white/50">Have an order?</span>
              <span className="block text-sm font-medium">Track Your Order</span>
            </span>
          </motion.button>
        ) : (
          // Expanded lookup card
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white rounded-xl shadow-2xl border border-gold/20 p-5 w-[300px]"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] tracking-[0.2em] uppercase text-charcoal/50">Track Your Order</p>
              <button
                onClick={() => { setExpanded(false); reset(); }}
                aria-label="Close"
                className="text-charcoal/40 hover:text-charcoal"
              >
                <X size={16} />
              </button>
            </div>

            {!order && (
              <form onSubmit={handleSearch} className="flex flex-col gap-2">
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Order ID or Mobile Number"
                  className="border border-charcoal/20 px-3 py-2.5 text-sm outline-none focus:border-charcoal transition-colors rounded-md"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="bg-wine text-white py-2.5 flex items-center justify-center gap-2 text-[11px] tracking-[0.15em] uppercase hover:bg-wine/90 transition-colors disabled:opacity-50 rounded-md"
                >
                  <Search size={13} /> {searching ? 'Searching...' : 'Track'}
                </button>
                {notFound && (
                  <p className="text-xs text-charcoal/50 text-center pt-1">
                    No order found. Check the ID or number and try again.
                  </p>
                )}
              </form>
            )}

            {order && (
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] text-charcoal/40 mb-0.5">Order ID</p>
                    <p className="font-mono text-sm font-medium">{order.order_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-charcoal/40 mb-0.5">Total</p>
                    <p className="font-mono text-sm font-medium">৳{order.total?.toLocaleString()}</p>
                  </div>
                </div>

                {!['cancelled', 'returned'].includes(order.status) ? (
                  <div className="flex justify-between mb-4">
                    {statusSteps.map((step, i) => {
                      const Icon = statusIcons[step];
                      const isDone = i <= currentStepIndex;
                      return (
                        <div key={step} className="flex-1 flex flex-col items-center relative">
                          {i > 0 && (
                            <div className={`absolute top-3 right-1/2 w-full h-0.5 -z-10 ${i <= currentStepIndex ? 'bg-wine' : 'bg-charcoal/10'}`} />
                          )}
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${isDone ? 'bg-wine text-white' : 'bg-charcoal/10 text-charcoal/30'}`}>
                            <Icon size={12} />
                          </div>
                          <p className={`text-[8px] tracking-wide uppercase text-center ${isDone ? 'text-charcoal' : 'text-charcoal/30'}`}>{step}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 text-red-600 rounded-md">
                    <XCircle size={16} />
                    <span className="text-xs font-medium capitalize">Order {order.status}</span>
                  </div>
                )}

                {order.tracking_note && (
                  <div className="bg-mist p-3 text-xs text-charcoal/70 rounded-md mb-3">
                    {order.tracking_note}
                  </div>
                )}

                <button
                  onClick={reset}
                  className="w-full text-center text-[11px] tracking-[0.15em] uppercase text-charcoal/50 hover:text-charcoal py-1"
                >
                  Track another order
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
