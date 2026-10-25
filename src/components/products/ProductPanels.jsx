import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { imgUrl } from '@/lib/storage';
import { addToCart, openCartDrawer, isInWishlist, toggleWishlist } from '@/lib/cartStore';
import { DELIVERY, sectionFor, isSizeAvailable, isSoldOut, formatPrice } from '@/lib/catalog';
import SizeChartPopup, { SizeTable } from '@/components/products/SizeChartPopup';
import { flyToBag } from '@/lib/flyToBag';
import { timeLeft } from '@/admin/lib/sales.js';
import { joinWishlist, hasJoined, savedEmail } from '@/admin/lib/wishlist.js';

// The product page's two side columns, shared with the lookbook's look view
// so buying from either looks and works the same: ProductInfo (name, price,
// details) on the left, BuyPanel (colour, size, add to bag) on the right.

// "Email me when it's back" for one sold-out size. The admin panel's
// Customers → Wishlist lists the requests, and restocking the size mails them.
export function RestockForm({ product, size }) {
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
        <label htmlFor={`restock-email-${product.id}`} className="sr-only">Email address</label>
        <input
          id={`restock-email-${product.id}`}
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

// Share a product: the phone's own share sheet where there is one (WhatsApp,
// Messenger, Instagram…), otherwise a small menu — copy the link, WhatsApp,
// Facebook. The icon is in the logo's orange.
export function ShareButton({ product }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef(null);
  const url = `${window.location.origin}/product/${product.id}`;
  const text = `${product.name}${product.variant ? `, ${product.variant}` : ''} — SUNDAY`;

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const share = async () => {
    const touch = window.matchMedia('(hover: none)').matches;
    if (touch && navigator.share) {
      try { await navigator.share({ title: text, text, url }); } catch { /* closed */ }
      return;
    }
    setOpen((v) => !v);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1200);
    } catch { /* no clipboard */ }
  };

  const item = 'block w-full text-left px-4 py-2 text-[13px] hover:bg-stone';
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" onClick={share} aria-label="Share this product" aria-expanded={open}
        className="p-1.5 -m-1.5 text-coral hover:text-[#E85A3B] transition-colors">
        <Share2 size={20} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-rule shadow-sm py-1 z-20" role="menu">
          <button type="button" role="menuitem" onClick={copy} className={item}>{copied ? 'Link copied' : 'Copy link'}</button>
          <a role="menuitem" className={item} target="_blank" rel="noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}>WhatsApp</a>
          <a role="menuitem" className={item} target="_blank" rel="noreferrer"
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}>Facebook</a>
        </div>
      )}
    </div>
  );
}

// Breadcrumb, name, colour name, price and sale line. `as` sets the
// heading level (the look view has its own page heading).
export function ProductHeader({ product, as: Heading = 'h1', kicker }) {
  const onSale = !!product.compare_at;
  const section = sectionFor(product.category);
  return (
    <>
      {kicker || (
        <nav className="text-[12px] text-graphite mb-4" aria-label="Breadcrumb">
          <Link to="/shop" className="hover:text-ink">Shop</Link>
          {section && (
            <>
              <span className="mx-1.5">/</span>
              <Link to={`/shop?category=${section.key}`} className="hover:text-ink">{section.label}</Link>
            </>
          )}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <Heading className="font-heading text-[28px] lg:text-[26px] leading-tight">{product.name}</Heading>
        <div className="pt-1.5"><ShareButton product={product} /></div>
      </div>
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
}

// Product details, sizing and delivery, each folded.
export function ProductDisclosures({ product }) {
  return (
    <div className="mt-8 border-b border-rule">
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
        {`Inside Dhaka: ${formatPrice(DELIVERY.insideDhaka)} delivery, cash on delivery.\nOutside Dhaka: ${formatPrice(DELIVERY.outsideDhaka)} delivery; ${formatPrice(DELIVERY.outsideAdvance)} paid in advance by bKash, the rest on delivery.\nOr pay the whole order by bKash at checkout.\n\nExchanges within 3 days of delivery, see the return and exchange page.`}
      </Disclosure>
    </div>
  );
}

// The product on screen, for the add-to-bag animation to start from.
function visiblePhoto(selector) {
  return [...document.querySelectorAll(selector)].find((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  });
}

// Colour, size (big buttons; sold-out sizes offer Notify me), Add to bag,
// Buy now and Save to wishlist — the buying side of a product. Holds its
// own choices; a new product starts fresh. `photoSelector` finds the photo
// the add-to-bag animation flies from. Returns { panel, add, size } so the
// product page's phone bar can share the same Add to bag.
export function useBuyPanel(product, { photoSelector = '[data-pdp-photo]' } = {}) {
  const navigate = useNavigate();
  const [size, setSize] = useState('');
  const [waitSize, setWaitSize] = useState('');
  const [sizeError, setSizeError] = useState(false);
  const [color, setColor] = useState('');
  const [wishlisted, setWishlisted] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [colours, setColours] = useState([]);
  const id = product?.id;
  const latest = useRef(product);
  latest.current = product;

  useEffect(() => {
    const p = latest.current;
    if (!p) return;
    setWaitSize('');
    setSizeError(false);
    setSize(p.sizes?.length === 1 && isSizeAvailable(p, p.sizes[0]) ? p.sizes[0] : '');
    setColor(p.colors?.[0] || '');
    setWishlisted(isInWishlist(p.id));
    // The same piece in its other colours (Admin: colour group).
    let cancelled = false;
    if (p.colour_group) {
      supabase.from('products').select('id,name,variant,images').eq('colour_group', p.colour_group).neq('id', p.id)
        .then(({ data }) => { if (!cancelled) setColours(data || []); });
    } else setColours([]);
    return () => { cancelled = true; };
  }, [id]);

  if (!product) return { panel: null, add: () => {}, size: '' };

  const soldOut = isSoldOut(product);

  const requireSize = () => {
    if (size) return true;
    setSizeError(true);
    return false;
  };

  const add = () => {
    if (!requireSize()) return;
    addToCart(product, size, 1);
    const first = (product.images || []).find(Boolean);
    flyToBag(visiblePhoto(photoSelector), first && imgUrl(first, 300)).then(openCartDrawer);
  };

  const buyNow = () => {
    if (!requireSize()) return;
    addToCart(product, size, 1);
    navigate('/checkout');
  };

  const pickSize = (s) => {
    if (isSizeAvailable(product, s)) { setSize(s); setWaitSize(''); setSizeError(false); }
    else { setSize(''); setWaitSize(waitSize === s ? '' : s); }
  };

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

  const pickedAt = product.sizes?.indexOf(size || waitSize) ?? -1;
  const stock = product.size_stock || product.stock;
  const left = size && stock && Object.keys(stock).length ? Number(stock[size]) || 0 : null;

  const sizePicker = product.sizes?.length > 0 && (
    <div className="mt-6 lg:mt-0">
      <div className="flex items-center justify-between mb-2.5">
        <p className={`text-[13px] ${sizeError ? 'text-coral' : ''}`}>
          {sizeError ? 'Choose a size to continue' : <>Size{size && <span className="text-graphite">: {size}</span>}</>}
        </p>
        <button type="button" onClick={() => setChartOpen(true)} className="text-[12px] text-graphite underline underline-offset-4 hover:text-ink">
          Size guide
        </button>
      </div>
      {/* One slim segmented bar; a dark pill slides to the size picked. A
          sold-out size is struck through with a dot: tapping it opens the
          Notify me form below (Admin → Customers → Wishlist). */}
      <div
        role="radiogroup"
        aria-label="Size"
        className={`relative grid p-1 rounded-full border transition-colors ${sizeError ? 'border-coral' : 'border-rule'}`}
        style={{ gridTemplateColumns: `repeat(${product.sizes.length}, minmax(0, 1fr))` }}
      >
        {pickedAt >= 0 && (
          <span
            aria-hidden="true"
            className={`absolute top-1 bottom-1 left-1 rounded-full transition-[transform,background-color] ${waitSize ? "bg-graphite" : "bg-ink"} duration-300 ease-[cubic-bezier(.2,.8,.2,1)]`}
            style={{ width: `calc((100% - 0.5rem) / ${product.sizes.length})`, transform: `translateX(${pickedAt * 100}%)` }}
          />
        )}
        {product.sizes.map((s, i) => {
          const ok = isSizeAvailable(product, s);
          const on = i === pickedAt;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={ok ? `Size ${s}` : `Size ${s}, sold out. Notify me when it's back`}
              onClick={() => pickSize(s)}
              className={`relative z-[1] h-10 rounded-full text-[13px] tracking-[0.04em] transition-colors duration-200 ${
                on ? (ok ? 'text-white' : 'text-white/80') : ok ? 'text-ink hover:bg-stone/70' : 'text-graphite/60 hover:text-graphite'
              }`}
            >
              <span className={ok ? '' : 'line-through decoration-1'}>{s}</span>
              {!ok && <span aria-hidden="true" className={`absolute top-2 right-[22%] w-1 h-1 rounded-full ${on ? 'bg-white/70' : 'bg-coral'}`} />}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] text-graphite empty:hidden">
        {waitSize
          ? null
          : size && left != null && left <= 3
            ? <span className="text-coral">Only {left} left in {size}</span>
            : product.sizes.some((x) => !isSizeAvailable(product, x))
              ? <><span className="inline-block w-1 h-1 mr-1.5 align-middle rounded-full bg-coral" />Sold out — tap to be told when it’s back</>
              : null}
      </p>
      {waitSize && <RestockForm key={waitSize} product={product} size={waitSize} />}
    </div>
  );

  const actions = (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        onClick={add}
        disabled={soldOut}
        className="w-full h-12 bg-ink text-white text-[13px] hover:bg-ink/85 disabled:bg-stone disabled:text-graphite disabled:cursor-not-allowed"
      >
        {soldOut ? 'Sold out' : 'Add to bag'}
      </button>
      {!soldOut && (
        <button type="button" onClick={buyNow} className="w-full h-12 border border-ink text-[13px] hover:bg-stone">
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

  const panel = (
    <>
      {colourPicker}
      {sizePicker}
      {actions}
      <SizeChartPopup open={chartOpen} onClose={() => setChartOpen(false)} category={product.category} chart={product.size_chart} />
    </>
  );

  return { panel, add, size };
}
