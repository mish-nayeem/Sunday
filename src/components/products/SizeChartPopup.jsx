import React, { useEffect } from 'react';
import { X } from 'lucide-react';

// Used when a product has no chart of its own (inches).
const DEFAULT_CHART = {
  columns: ['S', 'M', 'L', 'XL', 'XXL'],
  rows: [
    { label: 'Chest', values: ['38', '40', '42', '44', '46'] },
    { label: 'Length', values: ['27', '28', '29', '30', '31'] },
  ],
  notes: ['Measurements in inches.'],
};

// The product's own chart from the admin panel's product form
// ({ columns, rows: [{ label, values }], notes }), or the default above.
export default function SizeChartPopup({ open, onClose, chart }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Size guide">
      <div className="bg-white w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="font-heading text-[24px]">Size guide</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1"><X size={20} strokeWidth={1.5} /></button>
        </div>
        <SizeTable chart={chart} />
      </div>
    </div>
  );
}

// The chart itself, also shown inline under Sizing on the product page.
export function SizeTable({ chart }) {
  const c = chart?.rows?.length ? chart : DEFAULT_CHART;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-ink">
              <th className="text-left font-normal py-2 pr-4 text-graphite"></th>
              {c.columns.map((col) => <th key={col} className="text-left font-normal py-2 px-2">{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.label} className="border-b border-rule">
                <td className="py-2 pr-4">{r.label}</td>
                {c.columns.map((col, i) => <td key={col} className="py-2 px-2 tabular-nums">{r.values?.[i] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.notes?.length > 0 && (
        <ul className="mt-4 space-y-1 text-[12px] text-graphite">
          {c.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
        )}
    </>
  );
}
