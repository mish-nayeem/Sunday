import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { imgUrl } from '@/lib/storage';
import { addToCart, openCartDrawer, addRecentlyViewed, getRecentlyViewed, isInWishlist, toggleWishlist } from '@/lib/cartStore';
import { CATEGORY_LABELS, DELIVERY, sectionFor, isSizeAvailable, isSoldOut, formatPrice } from '@/lib/catalog';
import ProductCard from '@/components/products/ProductCard';
import SizeChartPopup, { SizeTable } from '@/components/products/SizeChartPopup';
import { useLiveSales, withSale } from '@/lib/pricing';
import { timeLeft } from '@/admin/lib/sales.js';
import { joinWishlist, hasJoined, savedEmail } from '@/admin/lib/wishlist.js';

// "Email me when it's back" for one sold-out size. The admin panel's
// Customers → Wishlist lists the requests, and restocking the size mails them.
function RestockForm({ product, size }) {
  const [email, setEmail] = useState(savedEmail());
  const [state, setState] = useState(hasJoined(product.id, size) ? 'done' : 'idle');

  if (state === 'done') {
    return <p className="mt-3 text-[13px]">We’ll email you when size {size} is back.</p>;
  }

  const submit = async (e) => {
    e.preventDefault();
    setState('sending');
    const { error } = await joinWishlist({ product, size, email });
    setState(error ? 'error' : 'done');
  };

  return (
    <form onSubmit={submit} className="mt-3">
      <p className="text-[13px] mb-2">Size {size} is sold out. Get an email when it’s back.</p>
      <div className="flex border-b border-ink">
        <label htmlFor="restock-email" className="sr-only">Email address</label>
        <input
          id="restock-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="flex-1 min-w-0 bg-transparent py-2 text-[13px] outline-none placeholder:text-graphite"
        />
        <button type="submit" disabled={state === 'sending'} className="pl-4 text-[13px] hover:underline underline-offset-4">
          Notify me
        </button>
      </div>
      {state === 'error' && <p className="mt-2 text-[12px] text-coral">That didn’t go through. Check the address and try again.</p>}
    </form>
  );
}

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

function SaleCountdown({ endsAt }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const left = timeLeft(endsAt);
  return left ? <span className="text-graphite"> · ends in {left}</span> : null;
}

function Disclosure({ title, children }) {
  const [open, setOpen] = useState(false);
  if (!children) return null;
  return (
    <div className="border-t border-rule">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between py-4 text-left text-[13px]"
      >
        {title}
        <span aria-hidden="true" className="text-[16px] leading-none">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="pb-5 text-[13px] leading-relaxed text-graphite whitespace-pre-line">{children}</div>}
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [raw, setRaw] = useState(null);
  const [colours, setColours] = useState([]);
  const [waitSize, setWaitSize] = useState('');
  const sales = useLiveSales();
  const product = withSale(raw, sales);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [sizeError, setSizeError] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const [look, setLook] = useState([]);
  const [recent, setRecent] = useState([]);
  const railRef = useRef(null);
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const wide = useWide();
  useOwnWheel(leftRef, wide && !loading);
  useOwnWheel(rightRef, wide && !loading);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setSize('');
      setWaitSize('');
      setSizeError(false);
      setSlide(0);
      const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
      if (cancelled) return;
      if (!p) { setRaw(null); setLoading(false); return; }
      setRaw(p);
      // The same piece in its other colours (Admin: colour group).
      if (p.colour_group) {
        const { data: sibs } = await supabase.from('products').select('id,name,variant,images')
          .eq('colour_group', p.colour_group).neq('id', p.id);
        if (!cancelled) setColours(sibs || []);
      } else {
        setColours([]);
      }
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
      setWishlisted(isInWishlist(p.id));
      setColor(p.colors?.[0] || '');
      // A single-size product needs no choice.
      if (p.sizes?.length === 1 && isSizeAvailable(p, p.sizes[0])) setSize(p.sizes[0]);
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

  const requireSize = () => {
    if (size) return true;
    setSizeError(true);
    return false;
  };

  const handleAdd = () => {
    if (!requireSize()) return;
    addToCart(product, size, 1);
    openCartDrawer();
  };

  const handleBuyNow = () => {
    if (!requireSize()) return;
    addToCart(product, size, 1);
    navigate('/checkout');
  };

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
  const onSale = !!product.compare_at;
  const section = sectionFor(product.category);

  const header = (
    <>
      <nav className="text-[12px] text-graphite mb-4" aria-label="Breadcrumb">
        <Link to="/shop" className="hover:text-ink">Shop</Link>
        {section && (
          <>
            <span className="mx-1.5">/</span>
            <Link to={`/shop?category=${section.key}`} className="hover:text-ink">{section.label}</Link>
          </>
        )}
      </nav>
      <h1 className="font-heading text-[28px] lg:text-[26px] leading-tight">{product.name}</h1>
      {product.variant && <p className="text-[14px] text-graphite mt-1">{product.variant}</p>}
      <p className="mt-2 text-[15px]">
        {onSale && <span className="text-graphite line-through mr-2">{formatPrice(product.compare_at)}</span>}
        <span className={onSale ? 'text-coral' : ''}>{formatPrice(product.price)}</span>
      </p>
      {product.sale && (
        <p className="mt-1 text-[13px] text-coral">
          {product.sale.percent}% off{product.sale.name ? `, ${product.sale.name}` : ''}
          <SaleCountdown endsAt={product.sale.endsAt} />
        </p>
      )}
    </>
  );

  const disclosures = (
    <>
      <Disclosure title="Product details">
        {[product.description, product.details, product.care_instructions, product.sku && `Style no. ${product.sku}`]
          .filter(Boolean).join('\n\n')}
      </Disclosure>
      <Disclosure title="Sizing">
        <div className="text-ink whitespace-normal">
          <SizeTable chart={product.size_chart} />
          <Link to="/support/size-guide" className="inline-block mt-3 underline underline-offset-4">Full size guide</Link>
        </div>
      </Disclosure>
      <Disclosure title="Delivery and returns">
        {`Inside Dhaka: ${formatPrice(DELIVERY.insideDhaka)}, cash on delivery.\nOutside Dhaka: ${formatPrice(DELIVERY.outsideDhaka)}, paid in advance by bKash.\n\nExchanges within 3 days of delivery, see the return and exchange page.`}
      </Disclosure>
    </>
  );

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

  // The same piece in other colours (Admin: colour group), this one ringed.
  const swatches = colours.length > 0 ? [{ id: product.id, name: product.name, variant: product.variant, images: product.images }, ...colours] : [];
  const colourPicker = swatches.length > 0 ? (
    <div className="mt-6 lg:mt-0 mb-6">
      <p className="text-[13px] mb-2">Colour: <span className="text-graphite">{product.variant || product.name}</span></p>
      <div className="flex flex-wrap gap-2">
        {swatches.map((c) => (
          <Link
            key={c.id}
            to={`/product/${c.id}`}
            aria-current={c.id === product.id ? 'true' : undefined}
            title={c.variant || c.name}
            className={`w-12 h-12 p-0.5 border ${c.id === product.id ? 'border-ink' : 'border-rule hover:border-graphite'}`}
          >
            <span className="block w-full h-full bg-stone overflow-hidden">
              {c.images?.[0] && <img src={imgUrl(c.images[0], 120)} alt={c.variant || c.name} className="w-full h-full object-cover" />}
            </span>
          </Link>
        ))}
      </div>
    </div>
  ) : product.colors?.length > 0 ? (
    <div className="mt-6 lg:mt-0 mb-6">
      <p className="text-[13px] mb-2">Colour: <span className="text-graphite">{color}</span></p>
      <div className="flex flex-wrap gap-2">
        {product.colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-pressed={color === c}
            className={`h-10 px-4 text-[13px] border ${color === c ? 'border-ink' : 'border-rule hover:border-graphite'}`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const pickSize = (s) => {
    if (!s) return;
    if (isSizeAvailable(product, s)) { setSize(s); setWaitSize(''); setSizeError(false); }
    else { setSize(''); setWaitSize(s); }
  };

  // Desktop: one "Select size" menu, like the colour row above it. Phones:
  // a row of size buttons, easier to hit with a thumb.
  const sizePicker = product.sizes?.length > 0 && (
    <div className="mt-6 lg:mt-0">
      <div className="flex items-center justify-between mb-2">
        <p className={`text-[13px] ${sizeError ? 'text-coral' : ''}`}>
          {sizeError ? 'Choose a size to continue' : <>Size{size && <span className="text-graphite">: {size}</span>}</>}
        </p>
        <button type="button" onClick={() => setSizeChartOpen(true)} className="text-[13px] underline underline-offset-4">
          Size guide
        </button>
      </div>
      {wide ? (
        <div className="relative">
          <label htmlFor="size-select" className="sr-only">Size</label>
          <select
            id="size-select"
            value={size || waitSize}
            onChange={(e) => pickSize(e.target.value)}
            className={`w-full h-12 appearance-none bg-white border px-4 pr-10 text-[13px] outline-none focus:border-ink ${sizeError ? 'border-coral' : 'border-rule'}`}
          >
            <option value="" disabled>Select size</option>
            {product.sizes.map((s) => (
              <option key={s} value={s}>{isSizeAvailable(product, s) ? s : `${s}, sold out (notify me)`}</option>
            ))}
          </select>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9l6 6 6-6" /></svg>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-1.5">
          {product.sizes.map((s) => {
            const ok = isSizeAvailable(product, s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={ok ? size === s : waitSize === s}
                aria-label={ok ? `Size ${s}` : `Size ${s}, sold out`}
                onClick={() => (ok ? pickSize(s) : setWaitSize(waitSize === s ? '' : s))}
                className={`h-11 text-[13px] border ${
                  !ok ? `text-graphite/60 line-through ${waitSize === s ? 'border-ink' : 'border-rule hover:border-graphite'}`
                    : size === s ? 'border-ink bg-ink text-white'
                      : 'border-rule hover:border-ink'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
      {waitSize && <RestockForm key={waitSize} product={product} size={waitSize} />}
    </div>
  );

  const actions = (
    <div className="mt-5 space-y-2">
      <button
        type="button"
        onClick={handleAdd}
        disabled={soldOut}
        className="w-full h-12 bg-ink text-white text-[13px] hover:bg-ink/85 disabled:bg-stone disabled:text-graphite disabled:cursor-not-allowed"
      >
        {soldOut ? 'Sold out' : 'Add to bag'}
      </button>
      {!soldOut && (
        <button type="button" onClick={handleBuyNow} className="w-full h-12 border border-ink text-[13px] hover:bg-stone">
          Buy now
        </button>
      )}
      <button
        type="button"
        onClick={() => setWishlisted(toggleWishlist(product.id))}
        className="w-full pt-2 text-[13px] underline underline-offset-4"
      >
        {wishlisted ? 'Saved to wishlist' : 'Save to wishlist'}
      </button>
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
        <div className="grid grid-cols-[minmax(240px,1fr)_minmax(340px,480px)_minmax(240px,1fr)] gap-10 xl:gap-16 px-6 h-[calc(100vh-4rem)]">
          {/* The side columns keep the wheel to themselves; the photos column
              runs on into the page (You may also like, footer) at its end. */}
          <div ref={leftRef} className="h-full overflow-y-auto hide-scrollbar py-10">
            <div className="max-w-sm">
              {header}
              <div className="mt-8 border-b border-rule">{disclosures}</div>
              {shopTheLook}
            </div>
          </div>
          <div className="h-full overflow-y-auto hide-scrollbar py-10 space-y-3">
            {(images.length ? images : [null]).map((img, i) => (
              <div key={i} className="aspect-[4/5] bg-stone">
                {img && (
                  <img
                    src={imgUrl(img, 1000)}
                    alt={`${product.name}, photo ${i + 1}`}
                    loading={i < 2 ? 'eager' : 'lazy'}
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            ))}
          </div>
          <div ref={rightRef} className="h-full overflow-y-auto hide-scrollbar py-10 flex">
            <div className="w-full max-w-sm ml-auto my-auto">
              {colourPicker}
              {sizePicker}
              {actions}
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
                    <img
                      src={imgUrl(img, 1200)}
                      alt={`${product.name}, photo ${i + 1}`}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
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

          <div className="px-4 md:px-8 pt-6 md:pt-10 pb-12">
            <div className="md:sticky md:top-24">
              {header}
              {colourPicker}
              {sizePicker}
              {actions}
              <div className="mt-8 border-b border-rule">{disclosures}</div>
              {shopTheLook}
            </div>
          </div>
        </div>
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
          <button type="button" onClick={handleAdd} className="w-full h-12 bg-ink text-white text-[13px]">
            {size ? `Add size ${size} to bag` : 'Add to bag'}, {formatPrice(product.price)}
          </button>
        </div>
      )}

      <SizeChartPopup open={sizeChartOpen} onClose={() => setSizeChartOpen(false)} category={product.category} chart={product.size_chart} />
    </div>
  );
}
