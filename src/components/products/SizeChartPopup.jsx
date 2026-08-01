import React from 'react';
import { X } from 'lucide-react';

const sizeChart = {
  default: [
    { size: 'S', chest: '38', length: '27' },
    { size: 'M', chest: '40', length: '28' },
    { size: 'L', chest: '42', length: '29' },
    { size: 'XL', chest: '44', length: '30' },
    { size: 'XXL', chest: '46', length: '31' },
  ],
};

export default function SizeChartPopup({ open, onClose }) {
  if (!open) return null;
  const rows = sizeChart.default;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5" onClick={onClose}>
      <div className="bg-white max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm tracking-[0.15em] uppercase font-medium">Size Guide (inches)</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sand/30">
              <th className="text-left py-2">Size</th>
              <th className="text-left py-2">Chest</th>
              <th className="text-left py-2">Length</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.size} className="border-b border-sand/10">
                <td className="py-2 font-medium">{r.size}</td>
                <td className="py-2 font-mono">{r.chest}"</td>
                <td className="py-2 font-mono">{r.length}"</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
