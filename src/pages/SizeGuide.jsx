import React from 'react';

const chart = [
  { size: 'S', chest: '38', length: '27', shoulder: '17' },
  { size: 'M', chest: '40', length: '28', shoulder: '17.5' },
  { size: 'L', chest: '42', length: '29', shoulder: '18' },
  { size: 'XL', chest: '44', length: '30', shoulder: '18.5' },
  { size: 'XXL', chest: '46', length: '31', shoulder: '19' },
];

export default function SizeGuide() {
  return (
    <div className="pt-20 md:pt-24 min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10 text-center">
        <h1 className="text-3xl md:text-4xl font-light tracking-wide">Size Guide</h1>
      </div>
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-16 md:py-24">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sand/30">
              <th className="text-left py-3">Size</th>
              <th className="text-left py-3">Chest (in)</th>
              <th className="text-left py-3">Length (in)</th>
              <th className="text-left py-3">Shoulder (in)</th>
            </tr>
          </thead>
          <tbody>
            {chart.map(r => (
              <tr key={r.size} className="border-b border-sand/10">
                <td className="py-3 font-medium">{r.size}</td>
                <td className="py-3 font-mono">{r.chest}</td>
                <td className="py-3 font-mono">{r.length}</td>
                <td className="py-3 font-mono">{r.shoulder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
