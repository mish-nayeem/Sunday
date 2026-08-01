import React from 'react';

export default function Terms() {
  return (
    <div className="pt-20 md:pt-24 min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10 text-center">
        <h1 className="text-3xl md:text-4xl font-light tracking-wide">Terms & Conditions</h1>
      </div>
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-16 md:py-24 space-y-4 text-sm text-charcoal/70 leading-relaxed">
        <p>By placing an order with SUNDAY, you agree to pay the full amount upon delivery (Cash on Delivery).</p>
        <p>Products must be returned unused, with original tags, within 7 days for an exchange or refund.</p>
      </div>
    </div>
  );
}
