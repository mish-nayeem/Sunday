import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { imgUrl } from '@/lib/storage';
import { fetchLooks, dropKey } from '@/admin/lib/lookbook.js';
import { useMenus, dropLink, lookbookLink } from '@/lib/menus';
import ProductCard from '@/components/products/ProductCard';

// A drop's lookbook (EXPLORE in the side menu): the photos uploaded in
// Admin → Lookbook. Tapping a photo opens it in the middle of the page with
// the pieces worn in it — shirt, trousers, bag, belt — underneath, each with
// its own photo, price and quick add. ?look=<id> keeps that view linkable,
// which is how the homepage's drop photos open a look straight away.
export default function Lookbook() {
  const { drop } = useParams();
  const [params, setParams] = useSearchParams();
  const lookId = params.get('look');
  const menus = useMenus();
  const [looks, setLooks] = useState(null);
  const [products, setProducts] = useState(new Map());

  useEffect(() => {
    let cancelled = false;
    setLooks(null);
    (async () => {
      const { looks: rows } = await fetchLooks(drop);
      const ids = [...new Set(rows.flatMap((l) => l.product_ids || []))];
      const { data } = ids.length ? await supabase.from('products').select('*').in('id', ids) : { data: [] };
      if (cancelled) return;
      setProducts(new Map((data || []).map((p) => [String(p.id), p])));
      setLooks(rows);
    })();
    return () => { cancelled = true; };
  }, [drop]);

  const itemsOf = (look) => (look.product_ids || [])
    .map((id) => products.get(String(id)))
    .filter(Boolean);

  const open = useMemo(() => looks?.find((l) => String(l.id) === lookId) || null, [looks, lookId]);

  useEffect(() => {
    if (lookId) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [lookId]);

  const showLook = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('look', id); else next.delete('look');
    setParams(next);
  };

  // The other drops' lookbooks, for hopping between drops without the menu.
  const drops = menus.explore.filter((m) => m.drop);
  const items = open ? itemsOf(open) : [];

  return (
    <div className="pb-20">
      <div className="sticky top-14 md:top-16 z-30 bg-white border-b border-rule">
        <div className="h-14 md:h-16 px-4 md:px-6 flex items-center gap-6">
          <nav className="flex-1 min-w-0 h-full flex items-center gap-7 overflow-x-auto hide-scrollbar max-md:pr-6 max-md:[mask-image:linear-gradient(to_right,black_80%,transparent)]" aria-label="Drops">
            {(drops.length ? drops : [{ key: drop, label: drop, drop }]).map((m) => {
              const on = dropKey(m.drop) === dropKey(drop);
              return (
                <Link
                  key={m.key}
                  to={lookbookLink(m.drop)}
                  aria-current={on ? 'page' : undefined}
                  className={`relative shrink-0 h-full flex items-center text-[11px] uppercase tracking-[0.16em] transition-colors ${on ? 'text-ink' : 'text-graphite hover:text-ink'}`}
                >
                  {m.label}
                  {on && <span className="absolute inset-x-0 bottom-0 h-px bg-burgundy" aria-hidden="true" />}
                </Link>
              );
            })}
          </nav>
          <Link to={dropLink(drop)} className="shrink-0 text-[11px] uppercase tracking-[0.16em] hover:underline underline-offset-4">
            Shop the drop
          </Link>
        </div>
      </div>

      {open && (
        <section className="px-4 md:px-6 pt-8 md:pt-12" aria-label="Look">
          <button type="button" onClick={() => showLook('')} className="text-[11px] uppercase tracking-[0.16em] text-graphite hover:text-ink">
            ← All looks
          </button>
          <figure className="mx-auto mt-6 max-w-[560px]">
            <div className="aspect-[4/5] bg-stone overflow-hidden">
              <img
                src={imgUrl(open.image_url, 1400)}
                alt={open.title || `${drop} look`}
                className="w-full h-full object-cover"
                style={{ objectPosition: open.focus || 'center' }}
              />
            </div>
            {open.title && <figcaption className="pt-3 text-center text-[13px]">{open.title}</figcaption>}
          </figure>

          {items.length > 0 && (
            <div className="mt-12 md:mt-16">
              <h2 className="font-body text-center text-[11px] uppercase tracking-[0.16em] text-graphite mb-6">In this look</h2>
              {/* Centred however many pieces the look has. */}
              <div className="flex flex-wrap justify-center gap-x-2 md:gap-x-4 gap-y-8">
                {items.map((p) => (
                  <div key={p.id} className="w-[calc(50%-4px)] md:w-[calc(25%-12px)]">
                    <ProductCard product={p} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="px-4 md:px-6 pt-10 md:pt-14">
        <div className="flex items-end justify-between gap-4 pb-6">
          <h1 className="font-heading text-[30px] md:text-[40px] leading-none">{open ? `More from ${drop}` : drop}</h1>
          {!open && <p className="text-[11px] uppercase tracking-[0.16em] text-graphite">Lookbook</p>}
        </div>

        {looks === null ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/5] bg-stone animate-pulse" />)}
          </div>
        ) : looks.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[15px] mb-3">This lookbook has no photos yet.</p>
            <Link to={dropLink(drop)} className="text-[13px] underline underline-offset-4">See the pieces in the shop</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-2 md:gap-x-3 gap-y-8">
            {looks.filter((l) => l !== open).map((l) => {
              const n = itemsOf(l).length;
              return (
                <button key={l.id} type="button" onClick={() => showLook(String(l.id))} className="group text-left">
                  <div className="relative aspect-[4/5] bg-stone overflow-hidden">
                    <img
                      src={imgUrl(l.image_url, 900)}
                      alt={l.title || `${drop} look`}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                      style={{ objectPosition: l.focus || 'center' }}
                    />
                  </div>
                  <div className="pt-2.5 flex items-baseline justify-between gap-3 text-[12px]">
                    <span className="min-w-0 truncate">{l.title}</span>
                    {n > 0 && <span className="shrink-0 text-graphite group-hover:text-ink">Shop the look · {n}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
