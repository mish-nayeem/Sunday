import React from 'react';

export default function Privacy() {
  return (
    <div className="min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10 text-center">
        <h1 className="text-3xl md:text-4xl font-light tracking-wide">Privacy Policy</h1>
      </div>
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-16 md:py-24 space-y-4 text-sm text-charcoal/70 leading-relaxed">
        <p>We collect only the information necessary to process your orders: name, mobile number, and delivery address.</p>
        <p>Your information is never sold or shared with third parties, and is used solely for order fulfillment and customer support.</p>
      </div>
    </div>
  );
}