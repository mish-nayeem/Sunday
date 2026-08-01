import React from 'react';
import { Instagram } from 'lucide-react';
import SectionHeader from '@/components/ui/SectionHeader';

export default function InstagramSection() {
  return (
    <section className="py-20 md:py-32 px-5 md:px-10 bg-mist">
      <div className="max-w-[1440px] mx-auto text-center">
        <SectionHeader label="Follow Along" title="@sunday.com.bd" />
        <a
          href="https://instagram.com"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 border border-obsidian text-obsidian text-[11px] tracking-[0.2em] uppercase px-8 py-4 hover:bg-obsidian hover:text-white transition-all duration-500"
        >
          <Instagram size={16} /> Visit Instagram
        </a>
      </div>
    </section>
  );
}
