import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { Search, Package, CheckCircle2, Truck, Clock, XCircle } from 'lucide-react';

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

export default function OrderTracking() {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

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

  const currentStepIndex = order ? statusSteps.indexOf(order.status) : -1;

  return (
    <div className="min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[11px] tracking-[0.3em] uppercase text-sand mb-3">Track Your Order</p>
          <h1 className="text-3xl md:text-4xl font-light tracking-wide">Where's My Order?</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 md:px-10 py-10 md:py-16">
        <form onSubmit={handleSearch} className="flex gap-3 mb-10">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Order ID (SND-XXXXX) or Mobile Number"
            className="flex-1 border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors"
          />
          <button
            type="submit"
            disabled={searching}
            className="bg-wine text-white px-6 py-3 flex items-center gap-2 text-[11px] tracking-[0.15em] uppercase hover:bg-wine/90 transition-colors disabled:opacity-50"
          >
            <Search size={14} /> {searching ? '...' : 'Track'}
          </button>
        </form>

        {notFound && (
          <p className="text-center text-charcoal/50 py-10">No order found with that Order ID or mobile number.</p>
        )}

        {order && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-gold/20 p-6 md:p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-xs text-charcoal/40 mb-1">Order ID</p>
                <p className="font-mono font-medium">{order.order_id}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-charcoal/40 mb-1">Total</p>
                <p className="font-mono font-medium">৳{order.total?.toLocaleString()}</p>
              </div>
            </div>

            {!['cancelled', 'returned'].includes(order.status) ? (
              <div className="flex justify-between mb-8">
                {statusSteps.map((step, i) => {
                  const Icon = statusIcons[step];
                  const isDone = i <= currentStepIndex;
                  return (
                    <div key={step} className="flex-1 flex flex-col items-center relative">
                      {i > 0 && (
                        <div className={`absolute top-4 right-1/2 w-full h-0.5 -z-10 ${i <= currentStepIndex ? 'bg-wine' : 'bg-charcoal/10'}`} />
                      )}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${isDone ? 'bg-wine text-white' : 'bg-charcoal/10 text-charcoal/30'}`}>
                        <Icon size={16} />
                      </div>
                      <p className={`text-[10px] tracking-wider uppercase ${isDone ? 'text-charcoal' : 'text-charcoal/30'}`}>{step}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-8 p-4 bg-red-50 text-red-600">
                <XCircle size={20} />
                <span className="text-sm font-medium capitalize">Order {order.status}</span>
              </div>
            )}

            <div className="border-t border-gold/20 pt-6">
              <p className="text-[11px] tracking-[0.2em] uppercase text-charcoal/40 mb-3">Items</p>
              {order.items?.map((item, i) => (
                <div key={i} className="flex justify-between text-sm py-1.5 border-b border-gold/10 last:border-0">
                  <span>{item.name} (Size: {item.size}) × {item.quantity}</span>
                  <span className="font-mono">৳{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
            </div>

            {order.tracking_note && (
              <div className="mt-6 bg-mist p-4 text-sm text-charcoal/70">
                {order.tracking_note}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}