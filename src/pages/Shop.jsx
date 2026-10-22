import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import ProductCard from '@/components/products/ProductCard';
import { SECTIONS, COLLECTIONS, SIZE_ORDER, isSizeAvailable, isSoldOut } from '@/lib/catalog';
import { useMenus, dropLink } from '@/lib/menus';
import { dropKey } from '@/admin/lib/lookbook.js';
import { fetchSetting } from '@/admin/lib/siteSettings.js';
import { imgUrl } from '@/lib/storage';

// The params that say which list is showing; sort, size and stock only refine it.
const LIST_KEYS = ['category', 'type', 'drop', 'filter', 'search'];

// Is this menu link the list on screen? Drop names match in any case.
function isCurrent(to, params) {
  if (!to.startsWith('/shop')) return false;
  const want = new URLSearchParams(to.split('?')[1] || '');
  const norm = (v) => (v || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return LIST_KEYS.every((k) => norm(want.get(k)) === norm(params.get(k)));
}

// A big lookbook photo in the grid with its heading; opens that look.
function ShopTile({ tile }) {
  return (
    <Link
      to={`/lookbook/${encodeURIComponent(tile.drop)}?look=${tile.look_id}`}
      className="group relative col-span-2 md:row-span-2 block bg-stone overflow-hidden min-h-[420px]"
    >
      <img
        src={imgUrl(tile.image_url, 1400)}
        alt=""
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
        style={{ objectPosition: tile.focus || 'center' }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" />
      <div className="absolute left-5 right-5 bottom-5 md:left-7 md:bottom-7 text-white">
        <p className="text-[11px] uppercase tracking-[0.16em] opacity-85 mb-2">{tile.drop} · Lookbook</p>
        {tile.heading && <p className="font-heading text-[28px] md:text-[38px] leading-none">{tile.heading}</p>}
        <p className="mt-4 inline-block text-[11px] uppercase tracking-[0.16em] border-b border-white pb-1">Shop the look</p>
      </div>
    </Link>
  );
}

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
  const menus = useMenus();
  const [tiles, setTiles] = useState([]);
  useEffect(() => {
    fetchSetting('shop_tiles').then(({ value }) => setTiles(Array.isArray(value) ? value : [])).catch(() => {});
  }, []);
  // Inside a drop: the other drops (EXPLORE), each opening its products here.
  // Anywhere else: the SHOP list.
  const tabs = drop
    ? menus.explore.filter((m) => m.drop).map((m) => ({ ...m, to: dropLink(m.drop) }))
    : menus.shop.filter((m) => m.to.startsWith('/shop'));

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
        // The drop itself is matched below, by dropKey: the same drop can be
        // typed "EID 2026", "eid 2026" or "EID 2026 " in different places.
        if (drop) query = query.not('drop_name', 'is', null);
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
      const limit = drop ? 1000 : 200;
      let { data, error } = await ordered.limit(limit);
      // Before the admin-panel migration has run there is no shop_position;
      // fall back to newest first rather than an empty shop.
      if (error && sortDef.value === 'featured') {
        ({ data } = await filtered().order('created_at', { ascending: false }).limit(limit));
      }
      const rows = drop ? (data || []).filter((p) => dropKey(p.drop_name) === dropKey(drop)) : data || [];
      if (!cancelled) {
        setProducts(rows);
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

  const filterCount = sizes.length + (inStockOnly ? 1 : 0) + (sort !== 'featured' ? 1 : 0);

  return (
    <div className="pb-20">
      {/* One quiet bar: the lists to hop between on the left — the other drops
          inside a drop, the categories everywhere else, as set in Admin → Side
          menu — and a single Filter button (sort, sold out, size) on the right. */}
      <div className="sticky top-14 md:top-16 z-30 bg-white border-b border-rule">
        <div className="h-14 md:h-16 px-4 md:px-6 flex items-center gap-6 text-[13px]">
          <nav className="flex-1 min-w-0 h-full flex items-center gap-7 overflow-x-auto hide-scrollbar max-md:pr-6 max-md:[mask-image:linear-gradient(to_right,black_80%,transparent)]" aria-label={drop ? 'Drops' : 'Categories'}>
            {tabs.map((m) => {
              const on = isCurrent(m.to, params);
              return (
                <Link
                  key={m.key}
                  to={m.to}
                  aria-current={on ? 'page' : undefined}
                  className={`relative shrink-0 h-full flex items-center text-[11px] uppercase tracking-[0.16em] transition-colors ${
                    on ? 'text-ink' : 'text-graphite hover:text-ink'
                  }`}
                >
                  {m.label}
                  {on && <span className="absolute inset-x-0 bottom-0 h-px bg-burgundy" aria-hidden="true" />}
                </Link>
              );
            })}
          </nav>
          <button type="button" onClick={() => setDrawerOpen(true)} className="shrink-0 text-[11px] uppercase tracking-[0.16em]">
            Filter{filterCount ? ` (${filterCount})` : ''}
          </button>
        </div>
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
            {visible.map((p, i) => {
              // After every 8 products, the next lookbook tile (Admin →
              // Lookbook → Shop page tiles), if there is one.
              const tile = (i + 1) % 8 === 0 && i + 1 < visible.length ? tiles[(i + 1) / 8 - 1] : null;
              return (
                <React.Fragment key={p.id}>
                  <ProductCard product={p} colours={coloursOf(p)} />
                  {tile && <ShopTile tile={tile} />}
                </React.Fragment>
              );
            })}
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
