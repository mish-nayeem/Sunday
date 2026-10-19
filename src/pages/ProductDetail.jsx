import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { imgUrl } from '@/lib/storage';
import { addToCart, openCartDrawer, addRecentlyViewed, isInWishlist, toggleWishlist } from '@/lib/cartStore';
import { CATEGORY_LABELS, DELIVERY, sectionFor, isSizeAvailable, isSoldOut, formatPrice } from '@/lib/catalog';
import ProductCard from '@/components/products/ProductCard';
import SizeChartPopup from '@/components/products/SizeChartPopup';

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
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [sizeError, setSizeError] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  const railRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setSize('');
      setSizeError(false);
      setSlide(0);
      const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
      if (cancelled) return;
      if (!p) { setProduct(null); setLoading(false); return; }
      setProduct(p);
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
  const onSale = product.discount_percentage > 0 && product.original_price > product.price;
  const section = sectionFor(product.category);

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

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        {/* Gallery: swipe rail on mobile, stacked photos on desktop */}
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

        {/* Details */}
        <div className="px-4 md:px-8 lg:px-10 pt-6 md:pt-10 pb-12">
          <div className="md:sticky md:top-24">
            <nav className="text-[12px] text-graphite mb-4" aria-label="Breadcrumb">
              <Link to="/shop" className="hover:text-ink">Shop</Link>
              {section && (
                <>
                  <span className="mx-1.5">/</span>
                  <Link to={`/shop?category=${section.key}`} className="hover:text-ink">{section.label}</Link>
                </>
              )}
            </nav>

            <h1 className="font-heading text-[28px] md:text-[32px] leading-tight">{product.name}</h1>
            <p className="mt-2 text-[15px]">
              {onSale && <span className="text-graphite line-through mr-2">{formatPrice(product.original_price)}</span>}
              <span className={onSale ? 'text-coral' : ''}>{formatPrice(product.price)}</span>
            </p>

            {product.colors?.length > 0 && (
              <div className="mt-7">
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
            )}

            {product.sizes?.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-[13px] ${sizeError ? 'text-coral' : ''}`}>
                    {sizeError ? 'Choose a size to continue' : <>Size{size && <span className="text-graphite">: {size}</span>}</>}
                  </p>
                  <button type="button" onClick={() => setSizeChartOpen(true)} className="text-[13px] underline underline-offset-4">
                    Size guide
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {product.sizes.map((s) => {
                    const ok = isSizeAvailable(product, s);
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={!ok}
                        aria-pressed={size === s}
                        onClick={() => { setSize(s); setSizeError(false); }}
                        className={`h-11 text-[13px] border ${
                          !ok ? 'border-rule text-graphite/50 line-through cursor-not-allowed'
                            : size === s ? 'border-ink bg-ink text-white'
                              : 'border-rule hover:border-ink'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={soldOut}
                className="w-full h-12 bg-ink text-white text-[13px] hover:bg-ink/85 disabled:bg-stone disabled:text-graphite disabled:cursor-not-allowed"
              >
                {soldOut ? 'Sold out' : 'Add to bag'}
              </button>
              {!soldOut && (
                <button
                  type="button"
                  onClick={handleBuyNow}
                  className="w-full h-12 border border-ink text-[13px] hover:bg-stone"
                >
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

            <div className="mt-8 border-b border-rule">
              <Disclosure title="Description">{product.description}</Disclosure>
              <Disclosure title="Details">
                {[product.details, product.sku && `Style no. ${product.sku}`, CATEGORY_LABELS[product.category]].filter(Boolean).join('\n')}
              </Disclosure>
              <Disclosure title="Care">{product.care_instructions}</Disclosure>
              <Disclosure title="Delivery and returns">
                {`Inside Dhaka: ${formatPrice(DELIVERY.insideDhaka)}, cash on delivery.\nOutside Dhaka: ${formatPrice(DELIVERY.outsideDhaka)}, paid in advance by bKash.\n\nSee the refund policy for returns and exchanges.`}
              </Disclosure>
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="px-4 md:px-6 pt-16 pb-28 md:py-24">
          <h2 className="font-heading text-[24px] md:text-[28px] mb-6">You may also like</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 md:gap-x-3 gap-y-8">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
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

      <SizeChartPopup open={sizeChartOpen} onClose={() => setSizeChartOpen(false)} category={product.category} />
    </div>
  );
}
