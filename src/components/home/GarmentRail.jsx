import React from 'react';
import { Link } from 'react-router-dom';
import fallback1 from '@/assets/feature-1.jpeg';
import fallback2 from '@/assets/feature-2.jpeg';
import fallback3 from '@/assets/feature-3.jpeg';
import fallback4 from '@/assets/attention.jpeg';

const FALLBACKS = [
  { id: 'f1', image: fallback1, name: 'Oxford Shirt' },
  { id: 'f2', image: fallback2, name: 'Linen Fit' },
  { id: 'f3', image: fallback3, name: 'Tailored Cut' },
  { id: 'f4', image: fallback4, name: 'Signature Weave' },
];

const formatPrice = (price) => (price ? `\u09F3 ${Number(price).toLocaleString('en-BD')}` : null);

function GarmentCard({ item, index }) {
  const rotation = index % 2 === 0 ? -2.5 : 2.5;
  const content = (
    <div
      className="group shrink-0 w-[150px] sm:w-[190px] md:w-[220px] select-none"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <div className="relative border border-ivory/15 bg-ivory/5 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.55)]">
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-gold shadow-[0_1px_3px_rgba(0,0,0,0.5)] z-10" />
        <div className="overflow-hidden aspect-[3/4]">
          <img
            src={item.image}
            alt={item.name}
            draggable={false}
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
          />
        </div>
        <div className="bg-ivory text-obsidian px-3 py-2">
          <p className="font-heading italic text-[13px] leading-tight truncate">{item.name}</p>
          {item.price ? (
            <p className="text-[10px] uppercase tracking-[0.15em] text-wine mt-0.5">{formatPrice(item.price)}</p>
          ) : (
            <p className="text-[10px] uppercase tracking-[0.15em] text-obsidian/40 mt-0.5">Sunday</p>
          )}
        </div>
      </div>
    </div>
  );

  return item.id.toString().startsWith('f') ? (
    content
  ) : (
    <Link to={`/product/${item.id}`} aria-label={item.name}>
      {content}
    </Link>
  );
}

function Row({ items, direction, speedClass }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden w-full">
      <div
        className={`flex gap-4 md:gap-6 w-max py-3 ${direction === 'left' ? 'animate-scroll-left' : 'animate-scroll-right'} ${speedClass} hover:[animation-play-state:paused]`}
      >
        {doubled.map((item, i) => (
          <GarmentCard key={`${item.id}-${i}`} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}

export default function GarmentRail({ products = [] }) {
  const withImages = products.filter((p) => p.images?.length);
  const pool = withImages.length >= 4 ? withImages : FALLBACKS;

  const items = pool.map((p) =>
    p.id?.toString?.().startsWith?.('f')
      ? p
      : { id: p.id, image: p.images[0], name: p.name, price: p.price }
  );

  const rowA = items.slice(0, Math.ceil(items.length / 2)) || items;
  const rowB = items.slice(Math.ceil(items.length / 2)).length ? items.slice(Math.ceil(items.length / 2)) : items;

  return (
    <div className="w-full space-y-4 md:space-y-6">
      <Row items={rowA.length ? rowA : items} direction="left" speedClass="[animation-duration:32s]" />
      <Row items={rowB} direction="right" speedClass="[animation-duration:38s] md:ml-10" />
    </div>
  );
}
