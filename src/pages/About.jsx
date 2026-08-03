import React from 'react';

export default function About() {
  return (
    <div className="min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10 text-center">
        <p className="text-[11px] tracking-[0.3em] uppercase text-sand mb-3">Our Story</p>
        <h1 className="text-3xl md:text-4xl font-light tracking-wide">About SUNDAY</h1>
      </div>
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-16 md:py-24">
        <p className="text-sm text-charcoal/70 leading-relaxed mb-6">
          SUNDAY is a premium men's fashion brand based in Bangladesh, crafting shirts, polos,
          cargo pants, and formal wear for the modern man who values quality and timeless style.
        </p>
        <p className="text-sm text-charcoal/70 leading-relaxed">
          We believe in Cash on Delivery convenience, honest pricing, and fabrics that last —
          delivered anywhere in Bangladesh.
        </p>
      </div>
    </div>
  );
}