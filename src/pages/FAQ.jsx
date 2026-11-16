import React from 'react';
import { Link } from 'react-router-dom';
import { DELIVERY } from '@/lib/catalog';

// Short answers, kept the same as checkout and the Support pages
// (src/admin/content/info-pages.js): the delivery charges come from the
// same numbers checkout uses, and each answer links to its full page.
const tk = (n) => `Tk ${n}`;
const faqs = [
  {
    q: 'How do I pay?',
    a: `Inside Dhaka: cash on delivery for the full amount, or pay it all by bKash at checkout. Outside Dhaka: ${tk(DELIVERY.outsideAdvance)} in advance by bKash and the rest in cash on delivery, or pay it all by bKash at checkout.`,
    link: { to: '/support/delivery', label: 'Delivery info' },
  },
  {
    q: 'How long does delivery take, and what does it cost?',
    a: `Inside Dhaka: 1–3 business days, ${tk(DELIVERY.insideDhaka)}. Outside Dhaka: 3–7 business days, ${tk(DELIVERY.outsideDhaka)}.`,
    link: { to: '/support/delivery', label: 'Delivery info' },
  },
  {
    q: 'Can I return or exchange an item?',
    a: 'We offer exchanges, not cash refunds. Ask within 3 days of delivery; the item must be unused, unwashed and unworn, with all tags attached. If you paid a bKash advance and the item turns out to be out of stock, that advance is refunded in full.',
    link: { to: '/support/portal', label: 'Return & Exchange Portal' },
  },
  {
    q: 'How do I track my order?',
    a: 'Use the Order Tracking page with your Order ID and the mobile number you ordered with.',
    link: { to: '/order-tracking', label: 'Track your order' },
  },
];

export default function FAQ() {
  return (
    <div className="min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10 text-center">
        <p className="text-[11px] tracking-[0.3em] uppercase text-sand mb-3">Need Help?</p>
        <h1 className="text-3xl md:text-4xl font-light tracking-wide">Frequently Asked Questions</h1>
      </div>
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-16 md:py-24 space-y-8">
        {faqs.map((f, i) => (
          <div key={i} className="border-b border-sand/20 pb-6">
            <p className="text-sm font-medium mb-2">{f.q}</p>
            <p className="text-sm text-charcoal/60">{f.a}</p>
            {f.link && (
              <Link to={f.link.to} className="inline-block mt-2 text-[12px] underline underline-offset-2 text-charcoal/70 hover:text-ink">
                {f.link.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}