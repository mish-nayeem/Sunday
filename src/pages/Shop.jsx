import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import ProductCard from '@/components/products/ProductCard';
import { SECTIONS, COLLECTIONS, SIZE_ORDER, CATEGORY_LABELS, isSizeAvailable, isSoldOut } from '@/lib/catalog';
import { useMenus } from '@/lib/menus';

const SORTS = [
  // The order set in Admin → Products → Product catalog (drag to reorder);
  // products never placed there come first, newest first.
  { value: 'featured', label: 'Recommended', column: 'shop_position', ascending: true },
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
  const type = params.get('type') || '';
  const drop = params.get('drop') || '';
  const sort = params.get('sort') || 'featured';
  const sizes = (params.get('size') || '').split(',').filter(Boolean);
  const inStockOnly = params.get('instock') === '1';

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const menus = useMenus();

  useEffect(() => {
    setListOpen(false);
  }, [params]);

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
      // A fresh builder each time: supabase-js builders change in place, so
      // the fallback below can't reuse one that already carries an order.
      const filtered = () => {
        let query = supabase.from('products').select('*');
        const section = SECTIONS.find((s) => s.key === category);
        if (section) query = query.in('category', section.categories);
        if (type) query = query.eq('category', type);
        // Any capitalisation: menus store drop names in capitals.
        if (drop) query = query.ilike('drop_name', drop.replace(/[\\%_]/g, (c) => `\\${c}`));
        const collection = COLLECTIONS.find((c) => c.key === filter);
        if (collection) query = query.eq(collection.column, true);
        // Characters PostgREST reads as filter syntax are dropped from the term.
        const term = search.replace(/[,()%*\\]/g, ' ').trim();
        if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
        return query;
      };
      const ordered = sortDef.value === 'featured'
        ? filtered().order('shop_position', { ascending: true, nullsFirst: true }).order('created_at', { ascending: false })
        : filtered().order(sortDef.column, { ascending: sortDef.ascending });
      let { data, error } = await ordered.limit(200);
      // Before the admin-panel migration has run there is no shop_position;
      // fall back to newest first rather than an empty shop.
      if (error && sortDef.value === 'featured') {
        ({ data } = await filtered().order('created_at', { ascending: false }).limit(200));
      }
      if (!cancelled) {
        setProducts(data || []);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [category, type, drop, filter, search, sort]);

  const visible = useMemo(() => products.filter((p) => {
    if (inStockOnly && isSoldOut(p)) return false;
    if (sizes.length && !sizes.some((s) => p.sizes?.includes(s) && isSizeAvailable(p, s))) return false;
    return true;
  }), [products, inStockOnly, sizes.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Colourways of the same piece (colour group), for the swatches on each card.
  const coloursOf = useMemo(() => {
    const groups = new Map();
    products.forEach((p) => {
      if (!p.colour_group) return;
      groups.set(p.colour_group, [...(groups.get(p.colour_group) || []), p]);
    });
    return (p) => (p.colour_group ? (groups.get(p.colour_group) || []).filter((o) => o.id !== p.id) : []);
  }, [products]);

  const allSizes = useMemo(() => {
    const set = new Set(products.flatMap((p) => p.sizes || []));
    const rank = (s) => (SIZE_ORDER.includes(s) ? SIZE_ORDER.indexOf(s) : SIZE_ORDER.length);
    return [...set].sort((a, b) => rank(a) - rank(b));
  }, [products]);

  const section = SECTIONS.find((s) => s.key === category);
  const collection = COLLECTIONS.find((c) => c.key === filter);
  const title = search ? `Results for “${search}”` : drop || (type && (CATEGORY_LABELS[type] || type)) || collection?.label || section?.label || 'Shop all';

  const filterCount = sizes.length + (inStockOnly ? 1 : 0) + (sort !== 'featured' ? 1 : 0);

  return (
    <div className="pb-20">
      {/* One quiet bar: what's showing (tap for the other lists) on the left,
          one Filter button (sort, sold out, size) on the right. */}
      <div className="sticky top-14 md:top-16 z-30 bg-white border-b border-rule">
        <div className="h-14 md:h-16 px-4 md:px-6 flex items-center justify-between gap-4 text-[13px]">
          <button type="button" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen} className="min-w-0 truncate text-left">
            {title} <span aria-hidden="true">{listOpen ? '−' : '+'}</span>
          </button>
          <button type="button" onClick={() => setDrawerOpen(true)} className="shrink-0">
            Filter{filterCount ? ` (${filterCount})` : ''}
          </button>
        </div>
        {listOpen && (
          <nav className="px-4 md:px-6 pb-5 pt-1 flex flex-wrap gap-x-6 gap-y-2 text-[13px]" aria-label="Shop lists">
            {menus.shop.map((m) => <Link key={m.key} to={m.to} className="text-graphite hover:text-ink">{m.label}</Link>)}
            {drop && <Link to={`/lookbook/${encodeURIComponent(drop)}`} className="underline underline-offset-4">{drop} lookbook</Link>}
          </nav>
        )}
      </div>

      <div className="px-4 md:px-6">
      {search && (
        <button type="button" onClick={() => setParam('search', '')} className="mt-4 inline-flex items-center gap-1 text-[13px] text-graphite hover:text-ink">
          <X size={13} /> Clear search
        </button>
      )}

      <div className="pt-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-2 md:gap-x-4 gap-y-8">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/5] bg-stone animate-pulse" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[15px] mb-3">No products match these filters.</p>
            <Link to="/shop" className="text-[13px] underline underline-offset-4">Clear filters and see everything</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-2 md:gap-x-4 gap-y-8 md:gap-y-12">
            {visible.map((p) => <ProductCard key={p.id} product={p} colours={coloursOf(p)} />)}
          </div>
        )}
      </div>

      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="Filter">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-[400px] bg-white flex flex-col">
            <div className="h-14 md:h-16 px-5 flex items-center justify-between border-b border-rule">
              <p className="text-[14px]">Filter</p>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close" className="p-1">
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
              <fieldset>
                <legend className="text-[12px] text-graphite mb-3">Sort by</legend>
                <div className="space-y-2">
                  {SORTS.map((x) => (
                    <label key={x.value} className="flex items-center gap-3 text-[14px] cursor-pointer">
                      <input type="radio" name="sort" className="accent-black" checked={sort === x.value}
                        onChange={() => setParam('sort', x.value === 'featured' ? '' : x.value)} />
                      {x.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-[12px] text-graphite mb-3">Availability</legend>
                <label className="flex items-center gap-3 text-[14px] cursor-pointer">
                  <input type="checkbox" className="accent-black" checked={inStockOnly}
                    onChange={(e) => setParam('instock', e.target.checked ? '1' : '')} />
                  Hide sold out items
                </label>
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
