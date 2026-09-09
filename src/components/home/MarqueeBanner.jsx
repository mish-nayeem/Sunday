import React from 'react';

const ITEMS = new Array(6).fill(0);

export default function MarqueeBanner() {
  return (
    <div className="w-full bg-cream overflow-hidden py-4 md:py-6">
      <div className="flex w-max animate-marquee">
        {[...ITEMS, ...ITEMS].map((_, i) => (
          <span
            key={i}
            className="flex items-center shrink-0 px-6 md:px-10 text-sm md:text-lg font-heading uppercase tracking-[0.1em] whitespace-nowrap"
          >
            <span className="text-obsidian">Everyday Feels Like&nbsp;</span>
            <span className="text-[#FF7254]">Sunday</span>
          </span>
        ))}
      </div>
    </div>
  );
}
