import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { imgUrl } from '@/lib/storage';
import { addRecentlyViewed, getRecentlyViewed } from '@/lib/cartStore';
import { sectionFor, isSoldOut, formatPrice } from '@/lib/catalog';
import ProductCard from '@/components/products/ProductCard';
import { ProductHeader, ProductDisclosures, useBuyPanel } from '@/components/products/ProductPanels';
import Lightbox from '@/components/products/Lightbox';
import { useLiveSales, withSale } from '@/lib/pricing';

// Three scrolling columns need room; below this the page stacks.
const WIDE = '(min-width: 1024px)';

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

// The wheel over a side column moves only that column — never the page,
// even when the column is too short to scroll. Non-passive so the page's
// own scroll can be stopped.
function useOwnWheel(ref, enabled) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const onWheel = (e) => {
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref, enabled]);
}

export default function ProductDetail() {
  const { id } = useParams();
  const [raw, setRaw] = useState(null);
  const sales = useLiveSales();
  const product = withSale(raw, sales);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const [look, setLook] = useState([]);
  const [recent, setRecent] = useState([]);
  const railRef = useRef(null);
  const [viewer, setViewer] = useState(null); // photo index open full screen, or null
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const wide = useWide();
  const buy = useBuyPanel(product);
  useOwnWheel(leftRef, wide && !loading);
  useOwnWheel(rightRef, wide && !loading);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setSlide(0);
      const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
      if (cancelled) return;
      if (!p) { setRaw(null); setLoading(false); return; }
      setRaw(p);
      // Shop the look: the other pieces in any lookbook photo this one is in.
      const { data: looks } = await supabase.from('lookbook_looks').select('product_ids').contains('product_ids', [p.id]);
      const others = [...new Set((looks || []).flatMap((l) => l.product_ids || []))].filter((x) => x !== p.id).slice(0, 4);
      if (others.length) {
        const { data: lookProducts } = await supabase.from('products').select('*').in('id', others);
        if (!cancelled) setLook(lookProducts || []);
      } else if (!cancelled) {
        setLook([]);
      }
      // Recently viewed, read before this visit is added to the list.
      const seen = getRecentlyViewed().filter((x) => x !== p.id).slice(0, 4);
      if (seen.length) {
        const { data: seenProducts } = await supabase.from('products').select('*').in('id', seen);
        if (!cancelled) setRecent(seen.map((x) => (seenProducts || []).find((r) => r.id === x)).filter(Boolean));
      } else if (!cancelled) {
        setRecent([]);
      }
      addRecentlyViewed(p.id);

      // Same section first, then anything newest, to fill four slots.
      const section = sectionFor(p.category);
      const { data: same } = await supabase.from('products').select('*')
        .in('category', section?.categories || [p.category]).neq('id', p.id).limit(4);
      let picks = same || [];
      if (picks.length < 4) {
        const { data: more } = await supabase.from('products').select('*')
          .neq('id', p.id).order('created_at', { ascending: false }).limit(8);
        const seen = new Set(picks.map((r) => r.id));
        picks = [...picks, ...(more || []).filter((r) => !seen.has(r.id))].slice(0, 4);
      }
      if (!cancelled) {
        setRelated(picks);
        setLoading(false);
      }
    };
    load();
    window.scrollTo(0, 0);
    return () => { cancelled = true; };
  }, [id]);

  const onRailScroll = () => {
    const el = railRef.current;
    if (el) setSlide(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (loading) {
    return (
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_420px]">
        <div className="aspect-[4/5] bg-stone animate-pulse" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="py-32 text-center px-4">
        <p className="text-[15px] mb-3">This product isn’t available any more.</p>
        <Link to="/shop" className="text-[13px] underline underline-offset-4">Continue shopping</Link>
      </div>
    );
  }

  const images = (product.images || []).filter(Boolean);
  const soldOut = isSoldOut(product);
  const header = <ProductHeader product={product} />;
  const disclosures = <ProductDisclosures product={product} />;

  // Pieces worn with this one in a lookbook photo (Admin → Lookbook).
  const shopTheLook = look.length > 0 && (
    <div className="mt-8">
      <p className="text-[13px] mb-3">Shop the look</p>
      <div className="grid grid-cols-2 gap-3">
        {look.map((p) => (
          <Link key={p.id} to={`/product/${p.id}`} className="group">
            <div className="aspect-[4/5] bg-stone overflow-hidden">
              {p.images?.[0] && <img src={imgUrl(p.images[0], 400)} alt="" loading="lazy" className="w-full h-full object-cover" />}
            </div>
            <p className="pt-2 text-[12px] leading-snug group-hover:underline underline-offset-2">{p.name}</p>
            <p className="text-[12px] text-graphite">{formatPrice(p.price)}</p>
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: product.description,
        image: product.images,
        brand: { '@type': 'Brand', name: 'SUNDAY' },
        offers: {
          '@type': 'Offer',
          price: product.price,
          priceCurrency: 'BDT',
          availability: soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        },
      }) }} />

      {wide ? (
        // Desktop: details | photos | buy box. Each column scrolls on its own
        // under the pointer; the photos are the long one.
        <div className="grid grid-cols-[minmax(240px,1fr)_minmax(340px,480px)_minmax(240px,1fr)] gap-10 xl:gap-16 h-[calc(100vh-4rem)]">
          {/* The side columns keep the wheel to themselves; the photos column
              runs on into the page (You may also like, footer) at its end. */}
          <div ref={leftRef} className="h-full overflow-y-auto hide-scrollbar py-10 px-6 bg-shell">
            <div className="max-w-sm">
              {header}
              {disclosures}
              {shopTheLook}
            </div>
          </div>
          <div className="h-full overflow-y-auto hide-scrollbar py-10 space-y-3">
            {(images.length ? images : [null]).map((img, i) => (
              <div key={i} className="aspect-[4/5] bg-stone">
                {img && (
                  <button type="button" onClick={() => setViewer(i)} className="block w-full h-full cursor-zoom-in" aria-label={`View photo ${i + 1} full screen`}>
                    <img
                      data-pdp-photo
                      src={imgUrl(img, 1000)}
                      alt={`${product.name}, photo ${i + 1}`}
                      loading={i < 2 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div ref={rightRef} className="h-full overflow-y-auto hide-scrollbar py-10 px-6 bg-shell flex">
            <div className="w-full max-w-sm ml-auto my-auto">
              {buy.panel}
            </div>
          </div>
        </div>
      ) : (
        <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
          {/* Gallery: swipe rail on phones, stacked photos on tablets */}
          <div className="relative">
            <div
              ref={railRef}
              onScroll={onRailScroll}
              className="flex md:block overflow-x-auto md:overflow-visible snap-x snap-mandatory hide-scrollbar"
            >
              {(images.length ? images : [null]).map((img, i) => (
                <div key={i} className="shrink-0 w-full snap-center aspect-[4/5] bg-stone md:mb-1">
                  {img && (
                    <button type="button" onClick={() => setViewer(i)} className="block w-full h-full cursor-zoom-in" aria-label={`View photo ${i + 1} full screen`}>
                      <img
                        data-pdp-photo
                        src={imgUrl(img, 1200)}
                        alt={`${product.name}, photo ${i + 1}`}
                        loading={i === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {images.length > 1 && (
              <p className="md:hidden absolute bottom-3 right-3 bg-white text-[11px] px-1.5 py-0.5">
                {slide + 1} / {images.length}
              </p>
            )}
          </div>

          <div className="px-4 md:px-8 pt-6 md:pt-10 pb-12 bg-shell">
            <div className="md:sticky md:top-24">
              {header}
              {buy.panel}
              {disclosures}
              {shopTheLook}
            </div>
          </div>
        </div>
      )}

      {viewer !== null && images.length > 0 && (
        <Lightbox images={images} start={viewer} alt={product.name} onClose={() => setViewer(null)} />
      )}

      {related.length > 0 && (
        <section className="px-4 md:px-6 pt-16 pb-28 md:py-24">
          <h2 className="font-heading text-[24px] md:text-[28px] mb-6">You may also like</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 md:gap-x-3 gap-y-8">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="px-4 md:px-6 pb-28 md:pb-24">
          <h2 className="font-heading text-[24px] md:text-[28px] mb-6">Recently viewed</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 md:gap-x-3 gap-y-8">
            {recent.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* Phone: keep the main action in reach while reading or scrolling photos */}
      {!soldOut && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-rule p-3">
          <button type="button" onClick={buy.add} className="w-full h-12 bg-coral text-white text-[13px]">
            {buy.size ? `Add size ${buy.size} to bag` : 'Add to bag'}, {formatPrice(product.price)}
          </button>
        </div>
      )}

    </div>
  );
}
