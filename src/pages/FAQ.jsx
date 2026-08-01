import React from 'react';

const faqs = [
  { q: 'How does Cash on Delivery work?', a: 'You pay in cash when your order is delivered to your doorstep. No advance payment needed.' },
  { q: 'How long does delivery take?', a: 'Inside Dhaka: 1-2 business days. Outside Dhaka: 2-4 business days.' },
  { q: 'What is your return policy?', a: 'You can return unused items with tags within 7 days of delivery.' },
  { q: 'How do I track my order?', a: 'Use the Order Tracking page with your Order ID or mobile number.' },
];

export default function FAQ() {
  return (
    <div className="pt-20 md:pt-24 min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10 text-center">
        <p className="text-[11px] tracking-[0.3em] uppercase text-sand mb-3">Need Help?</p>
        <h1 className="text-3xl md:text-4xl font-light tracking-wide">Frequently Asked Questions</h1>
      </div>
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-16 md:py-24 space-y-8">
        {faqs.map((f, i) => (
          <div key={i} className="border-b border-sand/20 pb-6">
            <p className="text-sm font-medium mb-2">{f.q}</p>
            <p className="text-sm text-charcoal/60">{f.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
