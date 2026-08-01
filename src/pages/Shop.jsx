import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { SlidersHorizontal, X } from 'lucide-react';
import ProductCard from '@/components/products/ProductCard';

const categoryLabels = {
  full_sleeve_shirts: 'Full Sleeve Shirts',
  half_sleeve_shirts: 'Half Sleeve Shirts',
  formal_shirts: 'Formal Shirts',
  polo: 'Polo',
  t_shirts: 'T-Shirts',
  cargo: 'Cargo',
  formal_pants: 'Formal Pants',
};

const sortOptions = [
  { label: 'Newest', value: '-created_date' },
  { label: 'Price: Low to High', value: 'price' },
  { label: 'Price: High to Low', value: '-price' },
  { label: 'Name A–Z', value: 'name' },
];

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const initialCat = params.get('category') || 'all';
  const initialSearch = params.get('search') || '';

  const [category, setCategory] = useState(initialCat);
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState('-created_date');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [sortFieldRaw, ascending] = sort.startsWith('-') ? [sort.slice(1), false] : [sort, true];
      const sortColumn = sortFieldRaw === 'created_date' ? 'created_at' : sortFieldRaw;

      let query = supabase.from('products').select('*');
      if (category !== 'all') query = query.eq('category', category);
      query = query.order(sortColumn, { ascending }).limit(100);

      const { data } = await query;
      let items = data || [];

      if (search.trim()) {
        const q = search.toLowerCase();
        items = items.filter(p =>
          p.name?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
        );
      }
      setProducts(items);
      setLoading(false);
    };
    load();
  }, [category, sort, search]);

  return (
    <div className="pt-20 md:pt-24">
      {/* Hero Banner */}
      <div className="bg-mist py-16 md:py-24 px-5 md:px-10">
        <div className="max-w-[1440px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-[11px] tracking-[0.3em] uppercase text-sand mb-3">The Archive</p>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-light tracking-wide">
              {categoryLabels[category] || 'All Products'}
            </h1>
          </motion.div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-10 md:py-16">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-2 text-[11px] tracking-[0.15em] uppercase border border-obsidian/20 px-4 py-2.5 hover:border-obsidian transition-colors"
            >
              <SlidersHorizontal size={14} /> Filters
            </button>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="text-sm border border-obsidian/20 px-4 py-2.5 bg-transparent outline-none w-48 placeholder:text-obsidian/30"
            />
            <span className="text-xs text-obsidian/40 font-mono hidden md:block">{products.length} items</span>
          </div>

          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="text-[11px] tracking-[0.1em] uppercase border border-obsidian/20 px-4 py-2.5 bg-transparent outline-none cursor-pointer"
          >
            {sortOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Category Filters */}
        {filtersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="border-b border-sand/30 pb-6 mb-10 flex flex-wrap gap-3"
          >
            {Object.entries(categoryLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={`text-[11px] tracking-[0.15em] uppercase px-5 py-2.5 border transition-all duration-300 ${
                  category === key
                   ? 'bg-wine text-white border-wine'
                   : 'border-charcoal/20 hover:border-charcoal'
                }`}
              >
                {label}
              </button>
            ))}
            {search && (
              <button
                onClick={() => setSearch('')}
                className="flex items-center gap-1 text-[11px] tracking-[0.1em] text-obsidian/50 hover:text-obsidian"
              >
                <X size={12} /> Clear search
              </button>
            )}
          </motion.div>
        )}

        {/* Product Grid */}
        {loading ? (
          <div className="flex justify-center py-32">
            <div className="w-8 h-8 border-2 border-sand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-32">
            <p className="text-obsidian/40 tracking-wider text-sm">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}
