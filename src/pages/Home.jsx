import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { imgUrl } from '@/lib/storage';
import { SECTIONS } from '@/lib/catalog';
import ProductCard from '@/components/products/ProductCard';
import heroImage from '@/assets/hero.jpeg';
import { fetchHeroSlides, slidesFor, isVideo, PHONE_QUERY } from '@/admin/lib/hero.js';
import { fetchHeroExtras, DEFAULT_HERO_BUTTON } from '@/admin/lib/siteSettings.js';
import { useCountdown } from '@/admin/components/DropCountdown.jsx';

// The panel saves labels in capitals; the storefront writes in sentence case.
const sentence = (text) => (text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : '');

// Full-screen hero under the see-through header: the photos or videos set in
// Admin → Homepage (phones get their own). Photos rotate every 5 seconds; a
// video plays to its end, then the next slide comes. Videos start muted
// (browsers only autoplay muted) — the speaker button bottom left turns the
// sound on. With nothing set yet, the campaign photo stands in.
function Hero({ slides, button, countdown }) {
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  const [at, setAt] = useState(0);
  const [muted, setMuted] = useState(true);
  const left = useCountdown(countdown?.at);
  const shown = slides.length ? slidesFor(slides, isPhone) : [{ id: 'default', image_url: heroImage }];
  const current = shown[at % shown.length];
  const playing = isVideo(current.image_url);
  const videoRefs = useRef({});

  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (shown.length < 2 || playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setAt((n) => (n + 1) % shown.length), 5000);
    return () => clearTimeout(t);
  }, [shown.length, at, playing]);

  // Only the slide on screen plays; it starts from the top each time.
  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, v]) => {
      if (!v) return;
      if (String(current.id) === id) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else v.pause();
    });
  }, [current.id]);

  const external = /^https?:/.test(button.link);

  return (
    <section className="relative h-[100svh] min-h-[480px] bg-ink overflow-hidden">
      {shown.map((s, i) => {
        const on = i === at % shown.length;
        const cls = `absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${on ? 'opacity-100' : 'opacity-0'}`;
        return isVideo(s.image_url) ? (
          <video
            key={s.id}
            ref={(el) => { videoRefs.current[s.id] = el; }}
            src={s.image_url}
            className={cls}
            style={{ objectPosition: s.focus || 'center' }}
            muted={muted}
            autoPlay={i === 0}
            loop={shown.length === 1}
            playsInline
            preload={i === 0 ? 'auto' : 'metadata'}
            onEnded={() => setAt((n) => (n + 1) % shown.length)}
            aria-label={s.label || 'SUNDAY campaign video'}
          />
        ) : (
          <img
            key={s.id}
            src={s.id === 'default' ? s.image_url : imgUrl(s.image_url, isPhone ? 900 : 2000)}
            alt={s.label || 'SUNDAY campaign'}
            fetchpriority={i === 0 ? 'high' : undefined}
            loading={i === 0 ? 'eager' : 'lazy'}
            className={cls}
            style={{ objectPosition: s.focus || 'center' }}
          />
        );
      })}

      {/* Keeps the white header readable over a bright photo. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/35 to-transparent" />

      {playing && (
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="absolute left-4 md:left-6 bottom-4 md:bottom-6 w-9 h-9 rounded-full bg-white text-ink flex items-center justify-center"
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          aria-pressed={!muted}
        >
          {muted ? <VolumeX size={17} strokeWidth={1.5} /> : <Volume2 size={17} strokeWidth={1.5} />}
        </button>
      )}

      <div className="absolute left-1/2 -translate-x-1/2 bottom-5 md:bottom-7 text-center whitespace-nowrap text-white text-[13px] [text-shadow:0_1px_8px_rgba(0,0,0,0.35)]">
        {left && <p className="tabular-nums mb-1">{sentence(countdown.label || 'Next drop')} in {left.toLowerCase()}</p>}
        {external ? (
          <a href={button.link} target="_blank" rel="noreferrer" className="underline underline-offset-4">{sentence(button.label)}</a>
        ) : (
          <Link to={button.link} className="underline underline-offset-4">{sentence(button.label)}</Link>
        )}
      </div>

      <h1 className="sr-only">SUNDAY. Everyday feels like Sunday.</h1>
    </section>
  );
}
import editorialImage from '@/assets/attention.jpeg';

function ProductRow({ title, to, products }) {
  if (!products.length) return null;
  return (
    <section className="px-4 md:px-6 py-14 md:py-20">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-heading text-[26px] md:text-[32px] leading-none">{title}</h2>
        <Link to={to} className="text-[13px] underline underline-offset-4">View all</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 md:gap-x-3 gap-y-8">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}

export default function Home() {
  const [products, setProducts] = useState([]);
  const [slides, setSlides] = useState([]);
  const [extras, setExtras] = useState({ button: DEFAULT_HERO_BUTTON, countdown: null });

  useEffect(() => {
    fetchHeroSlides().then(({ slides: s }) => setSlides(s || []));
    fetchHeroExtras().then((x) => setExtras(x)).catch(() => {});
  }, []);

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setProducts(data || []));
  }, []);

  const flagged = (key) => products.filter((p) => p[key]);
  const newArrivals = (flagged('is_new_arrival').length ? flagged('is_new_arrival') : products).slice(0, 4);
  const bestSellers = flagged('is_best_seller').slice(0, 4);
  // One photo per section, taken from its newest product.
  const tiles = SECTIONS.map((s) => ({
    ...s,
    image: products.find((p) => s.categories.includes(p.category) && p.images?.[0])?.images[0],
  })).filter((t) => t.image);

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'SUNDAY',
        url: 'https://sunday.com.bd',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://sunday.com.bd/shop?search={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      }) }} />

      <Hero slides={slides} button={extras.button} countdown={extras.countdown} />

      <ProductRow title="New arrivals" to="/shop?filter=new_arrival" products={newArrivals} />

      {/* Editorial block */}
      <section className="md:grid md:grid-cols-12 md:gap-6 md:items-end px-4 md:px-6">
        <div className="md:col-span-8 aspect-[16/9] md:aspect-[21/10] bg-stone overflow-hidden">
          <img src={editorialImage} alt="" loading="lazy" className="w-full h-full object-cover" />
        </div>
        <div className="md:col-span-4 pt-5 md:pt-0 max-w-sm">
          <h2 className="font-heading text-[26px] md:text-[32px] leading-tight mb-3">Made for the long week</h2>
          <p className="text-[14px] leading-relaxed text-graphite mb-4">
            Shirts, polos and trousers for everyday wear, from office mornings to Friday evenings.
          </p>
          <Link to="/about" className="text-[13px] underline underline-offset-4">About SUNDAY</Link>
        </div>
      </section>

      {tiles.length > 0 && (
        <section className="px-4 md:px-6 py-14 md:py-20">
          <h2 className="font-heading text-[26px] md:text-[32px] leading-none mb-6">Shop by category</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 md:gap-x-3 gap-y-6">
            {tiles.map((t) => (
              <Link key={t.key} to={`/shop?category=${t.key}`} className="group block">
                <div className="aspect-[4/5] bg-stone overflow-hidden">
                  <img src={imgUrl(t.image, 600)} alt="" loading="lazy" className="w-full h-full object-cover" />
                </div>
                <p className="pt-2.5 text-[13px] group-hover:underline underline-offset-2">{t.label}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <ProductRow title="Best sellers" to="/shop?filter=best_seller" products={bestSellers} />
    </div>
  );
}
