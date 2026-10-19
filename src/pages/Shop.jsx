import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import ProductCard from '@/components/products/ProductCard';
import { SECTIONS, COLLECTIONS, SIZE_ORDER, isSizeAvailable, isSoldOut } from '@/lib/catalog';

const SORTS = [
  { value: 'newest', label: 'Newest', column: 'created_at', ascending: false },
  { value: 'price_asc', label: 'Price, low to high', column: 'price', ascending: true },
  { value: 'price_desc', label: 'Price, high to low', column: 'price', ascending: false },
];

// Collection page. The URL is the source of truth (?category, ?filter,
// ?search, ?sort, ?size, ?instock) so links from the menu, search and the
// back button all land on the same view.
export default function Shop() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || 'all';
  const filter = params.get('filter') || '';
  const search = params.get('search') || '';
  const sort = params.get('sort') || 'newest';
  const sizes = (params.get('size') || '').split(',').filter(Boolean);
  const inStockOnly = params.get('instock') === '1';

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: key !== 'category' });
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const sortDef = SORTS.find((s) => s.value === sort) || SORTS[0];
      let query = supabase.from('products').select('*');
      const section = SECTIONS.find((s) => s.key === category);
      if (section) query = query.in('category', section.categories);
      const collection = COLLECTIONS.find((c) => c.key === filter);
      if (collection) query = query.eq(collection.column, true);
      // Characters PostgREST reads as filter syntax are dropped from the term.
      const term = search.replace(/[,()%*\\]/g, ' ').trim();
      if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      const { data } = await query.order(sortDef.column, { ascending: sortDef.ascending }).limit(200);
      if (!cancelled) {
        setProducts(data || []);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [category, filter, search, sort]);

  const visible = useMemo(() => products.filter((p) => {
    if (inStockOnly && isSoldOut(p)) return false;
    if (sizes.length && !sizes.some((s) => p.sizes?.includes(s) && isSizeAvailable(p, s))) return false;
    return true;
  }), [products, inStockOnly, sizes.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const allSizes = useMemo(() => {
    const set = new Set(products.flatMap((p) => p.sizes || []));
    const rank = (s) => (SIZE_ORDER.includes(s) ? SIZE_ORDER.indexOf(s) : SIZE_ORDER.length);
    return [...set].sort((a, b) => rank(a) - rank(b));
  }, [products]);

  const section = SECTIONS.find((s) => s.key === category);
  const collection = COLLECTIONS.find((c) => c.key === filter);
  const title = search ? `Results for “${search}”` : collection?.label || section?.label || 'Shop all';
  const activeCount = sizes.length + (inStockOnly ? 1 : 0) + (sort !== 'newest' ? 1 : 0);

  const tabClass = (active) =>
    `shrink-0 text-[13px] pb-1 border-b ${active ? 'border-ink text-ink' : 'border-transparent text-graphite hover:text-ink'}`;

  return (
    <div className="px-4 md:px-6 pb-20">
      <div className="pt-8 md:pt-12 pb-6 flex items-end justify-between gap-4">
        <h1 className="font-heading text-[32px] md:text-[44px] leading-none">{title}</h1>
        <p className="text-[13px] text-graphite shrink-0">{loading ? '' : `${visible.length} ${visible.length === 1 ? 'item' : 'items'}`}</p>
      </div>

      <div className="sticky top-14 md:top-16 z-30 bg-white -mx-4 md:-mx-6 px-4 md:px-6 py-3 border-b border-rule flex items-center gap-6">
        <nav className="flex-1 min-w-0 flex gap-5 overflow-x-auto hide-scrollbar" aria-label="Categories">
          <Link to="/shop" className={tabClass(category === 'all' && !filter && !search)}>All</Link>
          {SECTIONS.map((s) => (
            <Link key={s.key} to={`/shop?category=${s.key}`} className={tabClass(category === s.key)}>{s.label}</Link>
          ))}
          {COLLECTIONS.map((c) => (
            <Link key={c.key} to={`/shop?filter=${c.key}`} className={tabClass(filter === c.key)}>{c.label}</Link>
          ))}
        </nav>
        <button type="button" onClick={() => setDrawerOpen(true)} className="shrink-0 text-[13px] hover:underline underline-offset-4">
          Filter and sort{activeCount ? ` (${activeCount})` : ''}
        </button>
      </div>

      {search && (
        <button type="button" onClick={() => setParam('search', '')} className="mt-4 inline-flex items-center gap-1 text-[13px] text-graphite hover:text-ink">
          <X size={13} /> Clear search
        </button>
      )}

      <div className="pt-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-2 md:gap-x-3 gap-y-8">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/5] bg-stone animate-pulse" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[15px] mb-3">No products match these filters.</p>
            <Link to="/shop" className="text-[13px] underline underline-offset-4">Clear filters and see everything</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-2 md:gap-x-3 gap-y-8 md:gap-y-10">
            {visible.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="Filter and sort">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-[400px] bg-white flex flex-col">
            <div className="h-14 md:h-16 px-5 flex items-center justify-between border-b border-rule">
              <p className="text-[14px]">Filter and sort</p>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close" className="p-1">
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
              <fieldset>
                <legend className="text-[12px] text-graphite mb-3">Sort by</legend>
                <div className="space-y-2">
                  {SORTS.map((s) => (
                    <label key={s.value} className="flex items-center gap-3 text-[14px] cursor-pointer">
                      <input type="radio" name="sort" className="accent-black" checked={sort === s.value}
                        onChange={() => setParam('sort', s.value === 'newest' ? '' : s.value)} />
                      {s.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {allSizes.length > 0 && (
                <fieldset>
                  <legend className="text-[12px] text-graphite mb-3">Size</legend>
                  <div className="flex flex-wrap gap-2">
                    {allSizes.map((size) => {
                      const on = sizes.includes(size);
                      return (
                        <button
                          key={size}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setParam('size', (on ? sizes.filter((s) => s !== size) : [...sizes, size]).join(','))}
                          className={`min-w-12 h-10 px-3 text-[13px] border ${on ? 'border-ink bg-ink text-white' : 'border-rule hover:border-ink'}`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <label className="flex items-center gap-3 text-[14px] cursor-pointer">
                <input type="checkbox" className="accent-black" checked={inStockOnly}
                  onChange={(e) => setParam('instock', e.target.checked ? '1' : '')} />
                Hide sold out items
              </label>
            </div>
            <div className="p-5 border-t border-rule flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  ['sort', 'size', 'instock'].forEach((k) => next.delete(k));
                  setParams(next, { replace: true });
                }}
                className="flex-1 h-12 border border-ink text-[13px]"
              >
                Clear
              </button>
              <button type="button" onClick={() => setDrawerOpen(false)} className="flex-1 h-12 bg-ink text-white text-[13px]">
                Show {visible.length} {visible.length === 1 ? 'item' : 'items'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
