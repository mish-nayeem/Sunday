import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Plus, Trash2 } from 'lucide-react';

const categoryLabels = { inventory: 'Inventory', marketing: 'Marketing', operations: 'Operations', shipping: 'Shipping', utilities: 'Utilities', other: 'Other' };

export default function AdminExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', amount: '', category: 'inventory', date: new Date().toISOString().split('T')[0], notes: '' });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('expenses').select('*').order('date', { ascending: false }).limit(200);
      setExpenses(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await supabase.from('expenses').insert({ ...form, amount: Number(form.amount) });
    const { data } = await supabase.from('expenses').select('*').order('date', { ascending: false }).limit(200);
    setExpenses(data || []);
    setForm({ title: '', amount: '', category: 'inventory', date: new Date().toISOString().split('T')[0], notes: '' });
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    await supabase.from('expenses').delete().eq('id', id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" /></div>;
  }

  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-charcoal/50">Total Expenses: <span className="font-mono font-medium text-wine">৳{total.toLocaleString()}</span></p>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 text-[11px] tracking-wider uppercase bg-wine text-white px-4 py-2 hover:bg-wine/90 transition-colors">
          <Plus size={14} /> Add Expense
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gold/20 p-6 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-1">Title *</label>
            <input type="text" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine" />
          </div>
          <div>
            <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-1">Amount (৳) *</label>
            <input type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine" />
          </div>
          <div>
            <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-1">Category *</label>
            <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine">
              {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-1">Date *</label>
            <input type="date" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine" />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="bg-wine text-white text-[11px] tracking-wider uppercase px-6 py-2 hover:bg-wine/90 transition-colors">Save Expense</button>
          </div>
        </form>
      )}

      {expenses.length === 0 ? (
        <p className="text-center text-charcoal/40 py-20">No expenses recorded</p>
      ) : (
        <div className="bg-white border border-gold/20 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold/20 bg-ivory">
                <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left">Title</th>
                <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left">Category</th>
                <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-right">Amount</th>
                <th className="text-[10px] tracking-[0.15em] uppercase text-charcoal/50 py-3 px-4 text-left hidden md:table-cell">Date</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(exp => (
                <tr key={exp.id} className="border-b border-gold/10 hover:bg-ivory/50 transition-colors">
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium">{exp.title}</p>
                    {exp.notes && <p className="text-xs text-charcoal/40 mt-0.5">{exp.notes}</p>}
                  </td>
                  <td className="py-3 px-4"><span className="text-xs tracking-wider uppercase text-charcoal/50">{categoryLabels[exp.category] || exp.category}</span></td>
                  <td className="py-3 px-4 text-right"><span className="text-sm font-mono text-wine">৳{(exp.amount || 0).toLocaleString()}</span></td>
                  <td className="py-3 px-4 hidden md:table-cell"><span className="text-xs text-charcoal/40">{new Date(exp.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span></td>
                  <td className="py-3 px-4"><button onClick={() => handleDelete(exp.id)} className="p-1 text-charcoal/30 hover:text-red-500 transition-colors"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
