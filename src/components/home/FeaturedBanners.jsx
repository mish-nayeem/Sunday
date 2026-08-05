import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import banner1 from '@/assets/feature-1.jpeg';
import banner2 from '@/assets/feature-2.jpeg';
import banner3 from '@/assets/feature-3.jpeg';

const banners = [banner1, banner2, banner3];

export default function FeaturedBanners() {
  return (
    <section className="max-w-[1800px] mx-auto px-3 md:px-6 flex flex-col py-6">
      {banners.map((image, i) => (
        <div
          key={i}
          className="relative h-[70vh] min-h-[500px] md:h-[88vh] md:min-h-[760px] overflow-hidden"
          style={{
            backgroundImage: `url(${image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <Link
            to="/shop"
            className="group absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-white/90 px-4 py-2 text-obsidian hover:bg-white transition-colors duration-300"
          >
            <ShoppingBag size={14} strokeWidth={1.5} />
            <span className="text-[11px] uppercase tracking-[0.2em]">Shop</span>
          </Link>
        </div>
      ))}
    </section>
  );
}
