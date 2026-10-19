import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { imgUrl } from '@/lib/storage';
import { fetchLooks } from '@/admin/lib/lookbook.js';

// A drop's lookbook: the photos uploaded in Admin → Lookbook, two to a row
// on a phone and three on a computer. Each photo lists the pieces worn in
// it, each a link to its product page.
export default function Lookbook() {
  const { drop } = useParams();
  const [looks, setLooks] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLooks(null);
    (async () => {
      const { looks: rows } = await fetchLooks(drop);
      const ids = [...new Set(rows.flatMap((l) => l.product_ids || []))];
      const { data: products } = ids.length
        ? await supabase.from('products').select('id,name,variant').in('id', ids)
        : { data: [] };
      if (cancelled) return;
      const byId = new Map((products || []).map((p) => [String(p.id), p]));
      setLooks(rows.map((l) => ({
        ...l,
        items: (l.product_ids || [])
          .filter((id) => byId.has(String(id)))
          .map((id) => ({ product: byId.get(String(id)), label: l.item_labels?.[id]?.trim() || '' })),
      })));
    })();
    return () => { cancelled = true; };
  }, [drop]);

  return (
    <div className="px-4 md:px-6 pt-8 md:pt-12 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-8">
        <h1 className="font-heading text-[32px] md:text-[44px] leading-none">{drop}, lookbook</h1>
        <Link to={`/shop?drop=${encodeURIComponent(drop)}`} className="text-[13px] underline underline-offset-4">
          Shop {drop}
        </Link>
      </div>

      {looks === null ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/5] bg-stone animate-pulse" />)}
        </div>
      ) : looks.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-[15px] mb-3">This lookbook has no photos yet.</p>
          <Link to={`/shop?drop=${encodeURIComponent(drop)}`} className="text-[13px] underline underline-offset-4">See the pieces in the shop</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-2 md:gap-x-3 gap-y-8">
          {looks.map((l) => (
            <figure key={l.id}>
              <div className="aspect-[4/5] bg-stone overflow-hidden">
                <img
                  src={imgUrl(l.image_url, 900)}
                  alt={l.title || `${drop} look`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  style={{ objectPosition: l.focus || 'center' }}
                />
              </div>
              <figcaption className="pt-2.5 text-[13px] leading-snug">
                {l.title && <p className="mb-1">{l.title}</p>}
                {l.items.length > 0 && (
                  <ul className="text-graphite space-y-0.5">
                    {l.items.map(({ product, label }) => (
                      <li key={product.id}>
                        <Link to={`/product/${product.id}`} className="hover:text-ink hover:underline underline-offset-2">
                          {label || [product.name, product.variant].filter(Boolean).join(', ')}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
