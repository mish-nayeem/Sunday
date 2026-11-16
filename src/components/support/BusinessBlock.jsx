import React from 'react';
import { useBusiness, filledFields } from '@/admin/lib/business.js';

// The shop's registered details (Admin → Website → Business details) — only
// the ones filled in; nothing at all while none are.
export default function BusinessBlock({ className = '' }) {
  const rows = filledFields(useBusiness());
  if (!rows.length) return null;
  return (
    <section className={className} aria-label="Business details">
      <h2 className="font-heading text-[22px] mb-3">Business details</h2>
      <dl className="grid sm:grid-cols-2 gap-px bg-rule border border-rule">
        {rows.map((r) => (
          <div key={r.key} className="bg-white p-4">
            <dt className="text-[12px] text-graphite">{r.label.replace(/ \(.*\)$/, '')}</dt>
            <dd className="text-[14px] mt-1 break-words whitespace-pre-line">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
