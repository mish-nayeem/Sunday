import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { CheckCircle2, Package, MessageCircle } from 'lucide-react';

export default function OrderConfirmation() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('track_order', { p_order_id: orderId, p_mobile: null });
      if (data && data.length > 0) setOrder(data[0]);
      const { data: s } = await supabase.from('settings').select('*').limit(1);
      if (s && s.length > 0) setSettings(s[0]);
      setLoading(false);
    };
    load();
  }, [orderId]);

  if (loading) {
    return (
      <div className="pt-20 flex justify-center items-center min-h-screen">
        <div className="w-8 h-8 border-2 border-sand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="pt-20 flex flex-col items-center justify-center min-h-screen text-center px-5">
        <p className="text-charcoal/50 mb-4">We couldn't find that order.</p>
        <Link to="/" className="text-sm underline">Back to home</Link>
      </div>
    );
  }

  const whatsappNumber = settings?.whatsapp_number || '8801700000000';
  const whatsappMessage = encodeURIComponent(`Hi SUNDAY, I'd like to confirm my order ${order.order_id}.`);

  return (
    <div className="pt-20 md:pt-24 min-h-screen">
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-16 md:py-24 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <CheckCircle2 size={56} strokeWidth={1} className="mx-auto text-wine mb-6" />
          <p className="text-[11px] tracking-[0.3em] uppercase text-gold mb-2">Order Placed</p>
          <h1 className="text-2xl md:text-4xl font-light tracking-wide mb-4">Thank You, {order.full_name}!</h1>
          <p className="text-sm text-charcoal/60 mb-10">
            Your order has been received. We'll contact you on <span className="font-medium">{order.mobile}</span> to confirm delivery.
          </p>

          <div className="bg-ivory p-6 md:p-8 text-left mb-8">
            <div className="flex justify-between mb-4">
              <span className="text-xs text-charcoal/40">Order ID</span>
              <span className="font-mono font-medium">{order.order_id}</span>
            </div>
            {order.invoice_number && (
              <div className="flex justify-between mb-4">
                <span className="text-xs text-charcoal/40">Invoice No.</span>
                <span className="font-mono">{order.invoice_number}</span>
              </div>
            )}
            <div className="h-px bg-gold/20 my-4" />
            {order.items?.map((item, i) => (
              <div key={i} className="flex justify-between text-sm py-1.5">
                <span className="text-charcoal/60">{item.name} (Size: {item.size}) × {item.quantity}</span>
                <span className="font-mono">৳{(item.price * item.quantity).toLocaleString()}</span>
              </div>
            ))}
            <div className="h-px bg-gold/20 my-4" />
            <div className="flex justify-between mb-2">
              <span className="text-sm">Subtotal</span>
              <span className="text-sm font-mono">৳{order.subtotal?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between mb-4">
              <span className="text-sm">Delivery Charge</span>
              <span className="text-sm font-mono">৳{order.delivery_charge?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Total</span>
              <span className="text-lg font-mono font-medium">৳{order.total?.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white text-[11px] tracking-[0.15em] uppercase py-4 hover:bg-green-700 transition-colors"
            >
              <MessageCircle size={16} /> Confirm via WhatsApp
            </a>
            <Link
              to="/order-tracking"
              className="flex-1 flex items-center justify-center gap-2 border border-charcoal text-[11px] tracking-[0.15em] uppercase py-4 hover:bg-mist transition-colors"
            >
              <Package size={16} /> Track Order
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
