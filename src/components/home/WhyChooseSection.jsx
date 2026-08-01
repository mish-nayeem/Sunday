import React from 'react';
import { Truck, ShieldCheck, Undo2, HeartHandshake } from 'lucide-react';
import SectionHeader from '@/components/ui/SectionHeader';

const points = [
  { icon: Truck, title: 'Cash on Delivery', desc: 'Available all over Bangladesh' },
  { icon: ShieldCheck, title: 'Quality Assured', desc: 'Premium fabrics, built to last' },
  { icon: Undo2, title: 'Easy Returns', desc: 'Hassle-free exchange policy' },
  { icon: HeartHandshake, title: 'Customer First', desc: 'We are here to help, always' },
];

export default function WhyChooseSection() {
  return (
    <section className="py-20 md:py-32 px-5 md:px-10">
      <div className="max-w-[1440px] mx-auto">
        <SectionHeader label="Why Choose Us" title="The SUNDAY Promise" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {points.map((p, i) => (
            <div key={i} className="text-center">
              <p.icon size={28} strokeWidth={1} className="mx-auto text-sand mb-3" />
              <p className="text-sm font-medium mb-1">{p.title}</p>
              <p className="text-xs text-obsidian/50">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
