import React from 'react';
import { Link } from 'react-router-dom';
import SectionHeader from '@/components/ui/SectionHeader';

const categories = [
  { key: 'full_sleeve_shirts', label: 'Full Sleeve Shirts' },
  { key: 'half_sleeve_shirts', label: 'Half Sleeve Shirts' },
  { key: 'formal_shirts', label: 'Formal Shirts' },
  { key: 'polo', label: 'Polo' },
  { key: 't_shirts', label: 'T-Shirts' },
  { key: 'cargo', label: 'Cargo' },
  { key: 'formal_pants', label: 'Formal Pants' },
];

export default function CategoriesSection() {
  return (
    <section className="py-20 md:py-32 px-5 md:px-10">
      <div className="max-w-[1440px] mx-auto">
        <SectionHeader label="Shop By" title="Category" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map(c => (
            <Link
              key={c.key}
              to={`/shop?category=${c.key}`}
              className="border border-sand/30 text-center py-8 px-4 hover:border-obsidian hover:bg-mist transition-all duration-300"
            >
              <span className="text-[11px] tracking-[0.15em] uppercase">{c.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
