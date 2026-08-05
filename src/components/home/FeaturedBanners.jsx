import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import banner1 from '@/assets/feature-1.jpeg';
import banner2 from '@/assets/feature-2.jpeg';
import banner3 from '@/assets/feature-3.jpeg';

const banners = [banner1, banner2, banner3];

export default function FeaturedBanners() {
  return (
   <section className="max-w-4xl mx-auto px-5 md:px-10 flex flex-col py-6">
      {banners.map((image, i) => (
        <div key={i} className="flex flex-col">
          <div
            className="h-[40vh] min-h-[280px] md:h-[50vh] md:min-h-[420px] overflow-hidden"
            style={{
              backgroundImage: `url(${image})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />
          <Link
            to="/shop"
            className="group flex items-center justify-center gap-1.5 py-4 text-obsidian hover:text-sand transition-colors duration-300"
          >
            <ShoppingBag size={14} strokeWidth={1.5} />
            <span className="text-[11px] uppercase tracking-[0.2em]">Shop</span>
          </Link>
        </div>
      ))}
    </section>
  );
}
