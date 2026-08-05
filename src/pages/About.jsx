import React from 'react';
import attentionImage from '@/assets/attention.jpeg';

export default function About() {
  return (
    <div className="min-h-screen">
      {/* Hero image */}
      <section
        className="relative h-[45vh] min-h-[320px] md:h-[60vh] md:min-h-[560px] overflow-hidden"
        style={{
          backgroundImage: `url(${attentionImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      {/* Description */}
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

      {/* Sliding quote */}
      <div className="border-y border-obsidian/10 bg-obsidian py-8 overflow-hidden">
        <div className="flex whitespace-nowrap animate-marquee">
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className="mx-8 text-xl md:text-3xl font-light tracking-[0.15em] uppercase text-white/90"
            >
              Every day feels like SUNDAY
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}