import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AlertTriangle, Plus } from 'lucide-react';
import ProductForm from './ProductForm';

const categoryLabels = { full_sleeve_shirts: 'Full Sleeve Shirts', half_sleeve_shirts: 'Half Sleeve Shirts', formal_shirts: 'Formal Shirts', polo: 'Polo', t_shirts: 'T-Shirts', cargo: 'Cargo', formal_pants: 'Formal Pants' };

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const reload = async () => {
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false }).limit(100);
    setProducts(data || []);
  };

  useEffect(() => {
    const load = async () => {
      await reload();
      setLoading(false);
    };
    load();
  }, []);

  const handleEdit = (id, field, value) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: Number(value) || 0 } }));
  };

  const handleSave = async (product) => {
    setSaving(product.id);
    const changes = edits[product.id] || {};
    await supabase.from('products').update(changes).eq('id', product.id);
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...changes } : p));
    setEdits(prev => { const n = { ...prev }; delete n[product.id]; return n; });
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-6 h-6 border-2 border-sand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalCost = products.reduce((s, p) => s + (p.cost_price || 0) * (p.quantity || 0), 0);
  const totalValue = products.reduce((s, p) => s + (p.price || 0) * (p.quantity || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-obsidian/50">
          Total Investment: <span className="font-mono font-medium text-obsidian">৳{totalCost.toLocaleString()}</span>
          <span className="mx-2">·</span>
          Stock Value: <span className="font-mono font-medium text-obsidian">৳{totalValue.toLocaleString()}</span>
        </p>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 text-[11px] tracking-wider uppercase bg-wine text-white px-4 py-2 hover:bg-wine/90 transition-colors">
          <Plus size={14} /> Add Product
        </button>
      </div>

      {showForm && <ProductForm onCreated={() => { setShowForm(false); reload(); }} />}

      <div className="bg-white border border-sand/30 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-sand/30 bg-mist">
              <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-left">Product</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-right">Price</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-right">Cost Price</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-right">Profit/Unit</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-right">Margin</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4 text-center">Qty</th>
              <th className="text-[10px] tracking-[0.15em] uppercase text-obsidian/50 py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {products.map(product => {
              const cost = edits[product.id]?.cost_price ?? product.cost_price ?? 0;
              const qty = edits[product.id]?.quantity ?? product.quantity ?? 0;
              const profit = (product.price || 0) - cost;
              const margin = product.price > 0 ? Math.round((profit / product.price) * 100) : 0;
              const hasEdit = !!edits[product.id];
              const lowStock = qty <= 5;

              return (
                <tr key={product.id} className="border-b border-sand/10 hover:bg-mist/30 transition-colors">
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-[10px] tracking-wider uppercase text-obsidian/40">{categoryLabels[product.category]}</p>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-sm font-mono">৳{(product.price || 0).toLocaleString()}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <input
                      type="number"
                      value={cost}
                      onChange={e => handleEdit(product.id, 'cost_price', e.target.value)}
                      className="w-24 text-right text-sm font-mono border border-sand/30 px-2 py-1 outline-none focus:border-obsidian bg-transparent"
                    />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-sm font-mono text-green-600">৳{profit.toLocaleString()}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`text-xs font-mono ${margin >= 40 ? 'text-green-600' : margin >= 20 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {margin}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        value={qty}
                        onChange={e => handleEdit(product.id, 'quantity', e.target.value)}
                        className={`w-16 text-center text-sm font-mono border px-2 py-1 outline-none focus:border-obsidian bg-transparent ${lowStock ? 'border-red-300' : 'border-sand/30'}`}
                      />
                      {lowStock && <AlertTriangle size={12} className="text-red-400" />}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleSave(product)}
                      disabled={!hasEdit || saving === product.id}
                      className={`text-[10px] tracking-wider uppercase px-3 py-1.5 transition-colors ${hasEdit ? 'bg-obsidian text-white hover:bg-obsidian/90' : 'bg-mist text-obsidian/30 cursor-not-allowed'}`}
                    >
                      {saving === product.id ? '...' : 'Save'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
