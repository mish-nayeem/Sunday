import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { imgUrl } from '@/lib/storage';
import heroImage from '@/assets/hero.jpeg';
import { fetchHeroSlides, slidesFor, isVideo, PHONE_QUERY } from '@/admin/lib/hero.js';
import { fetchHeroExtras, DEFAULT_HERO_BUTTON } from '@/admin/lib/siteSettings.js';
import { useCountdown } from '@/admin/components/DropCountdown.jsx';
import { fetchFeatures, dropShopLink } from '@/admin/lib/features.js';

// The panel saves labels in capitals; the storefront writes in sentence case.
const sentence = (text) => (text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : '');

// Full-screen hero under the see-through header: the photos or videos set in
// Admin → Homepage (phones get their own). Photos rotate every 5 seconds; a
// video plays to its end, then the next slide comes. Videos start muted
// (browsers only autoplay muted) — the speaker button bottom left turns the
// sound on. With nothing set yet, the campaign photo stands in.
// Square-edged white outline button over a photo: SHOP NOW, A CLOSER LOOK.
function HeroButton({ to, children }) {
  const cls = 'inline-flex items-center justify-center h-10 md:h-11 px-5 md:px-6 border border-white text-white text-[11px] md:text-[12px] font-semibold uppercase tracking-[0.08em] hover:bg-white hover:text-ink transition-colors';
  return /^https?:/.test(to)
    ? <a href={to} target="_blank" rel="noreferrer" className={cls}>{children}</a>
    : <Link to={to} className={cls}>{children}</Link>;
}

// A drop under the hero (Admin → Homepage → Drop sections): a wide photo with
// the drop's name and a line of text bottom left, SHOP NOW bottom right
// (→ only that drop's products), then a row of picked photos, each opening
// its look in the drop's lookbook.
function DropFeature({ f, isPhone }) {
  const shop = dropShopLink(f.drop_name);
  const banner = (isPhone && f.mobile_image_url) || f.image_url;
  const pics = (Array.isArray(f.pics) ? f.pics : []).filter((p) => p?.url);
  return (
    <section className="pb-10 md:pb-14">
      {banner && (
        <div className="relative h-[70svh] min-h-[340px] bg-stone overflow-hidden">
          <Link to={shop} className="absolute inset-0" tabIndex={-1} aria-hidden="true">
            <img
              src={imgUrl(banner, isPhone ? 900 : 2000)}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: f.focus || 'center' }}
            />
          </Link>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/45 to-transparent" />
          <div className="pointer-events-none absolute inset-x-4 md:inset-x-6 bottom-5 md:bottom-7 flex flex-col md:flex-row md:items-end md:justify-between gap-4 text-white">
            <div className="max-w-md">
              <h2 className="font-heading text-[30px] md:text-[40px] leading-none">{f.title || f.drop_name}</h2>
              {f.blurb && <p className="mt-3 text-[13px] leading-snug">{f.blurb}</p>}
            </div>
            <div className="pointer-events-auto flex gap-3 shrink-0">
              <HeroButton to={shop}>Shop now</HeroButton>
              {f.show_lookbook && <HeroButton to={`/lookbook/${encodeURIComponent(f.drop_name)}`}>A closer look</HeroButton>}
            </div>
          </div>
        </div>
      )}
      {!banner && (
        <div className="px-4 md:px-6 pt-10 flex items-end justify-between gap-4">
          <div className="max-w-md">
            <h2 className="font-heading text-[30px] md:text-[40px] leading-none">{f.title || f.drop_name}</h2>
            {f.blurb && <p className="mt-3 text-[13px] text-graphite">{f.blurb}</p>}
          </div>
          <Link to={shop} className="text-[13px] underline underline-offset-4 shrink-0">Shop now</Link>
        </div>
      )}
      {pics.length > 0 && (
        <div className="px-4 md:px-6 pt-4 md:pt-5 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
          {pics.map((p, i) => {
            // Every photo opens the drop's lookbook: on its own look (with the
            // products worn in it) when it is one, else on the drop's looks.
            const lookbook = `/lookbook/${encodeURIComponent(f.drop_name)}`;
            const to = p.look_id ? `${lookbook}?look=${p.look_id}` : lookbook;
            return (
              <Link key={`${p.url}-${i}`} to={to} className="group relative block aspect-[3/4] bg-stone overflow-hidden">
                <img src={imgUrl(p.url, 700)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                <span className="absolute right-3 bottom-3 md:right-4 md:bottom-4 text-white [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.45))]" aria-hidden="true">
                  <ShoppingBag size={22} strokeWidth={1.25} />
                </span>
                <span className="sr-only">{p.look_id ? 'Shop this look' : `${f.drop_name} lookbook`}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

// An editorial block (Admin → Homepage): one big photo beside a heading, two
// lines of text and an optional link, like a magazine spread. Photo left on
// a computer, on top on a phone.
function Editorial({ f, isPhone }) {
  const photo = (isPhone && f.mobile_image_url) || f.image_url;
  const external = /^https?:/.test(f.link || '');
  const linkClass = 'inline-block mt-6 text-[11px] uppercase tracking-[0.16em] border-b border-ink pb-1 hover:text-burgundy hover:border-burgundy transition-colors';
  return (
    <section className="px-4 md:px-6 pb-12 md:pb-20">
      <div className="md:grid md:grid-cols-12 md:gap-8 md:items-center">
        {photo && (
          <div className="md:col-span-7 aspect-[4/5] bg-stone overflow-hidden">
            <img src={imgUrl(photo, isPhone ? 900 : 1600)} alt="" loading="lazy" className="w-full h-full object-cover" style={{ objectPosition: f.focus || 'center' }} />
          </div>
        )}
        <div className={`pt-6 md:pt-0 ${photo ? 'md:col-span-4 md:col-start-9' : 'md:col-span-8 md:col-start-3 text-center'}`}>
          <p className="text-[11px] uppercase tracking-[0.16em] text-burgundy mb-4">Editorial</p>
          {f.title && <h2 className="font-heading text-[32px] md:text-[44px] leading-[1.05]">{f.title}</h2>}
          {f.blurb && <p className="mt-4 text-[14px] leading-relaxed text-graphite max-w-md">{f.blurb}</p>}
          {f.link && (external
            ? <a href={f.link} target="_blank" rel="noreferrer" className={linkClass}>{f.link_label || 'Discover'}</a>
            : <Link to={f.link} className={linkClass}>{f.link_label || 'Discover'}</Link>)}
        </div>
      </div>
    </section>
  );
}

function Hero({ slides, button, countdown }) {
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  const [at, setAt] = useState(0);
  const [muted, setMuted] = useState(true);
  const left = useCountdown(countdown?.at);
  // slides is null while they load: the hero stays dark rather than flash the
  // built-in photo before the admin's own photo or video arrives. The
  // built-in photo is only for a shop with no hero set at all.
  const shown = slides === null ? [] : slides.length ? slidesFor(slides, isPhone) : [{ id: 'default', image_url: heroImage }];
  const current = shown.length ? shown[at % shown.length] : null;
  const playing = !!current && isVideo(current.image_url);
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
      if (current && String(current.id) === id) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else v.pause();
    });
  }, [current?.id]);

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

      <div className="absolute left-1/2 -translate-x-1/2 bottom-5 md:bottom-7 flex flex-col items-center gap-2 whitespace-nowrap text-white">
        {left && <p className="tabular-nums text-[13px] [text-shadow:0_1px_8px_rgba(0,0,0,0.35)]">{sentence(countdown.label || 'Next drop')} in {left.toLowerCase()}</p>}
        <HeroButton to={button.link}>{button.label}</HeroButton>
      </div>

      <h1 className="sr-only">SUNDAY. Everyday feels like Sunday.</h1>
    </section>
  );
}
export default function Home() {
  const [slides, setSlides] = useState(null); // null until loaded
  const [extras, setExtras] = useState({ button: DEFAULT_HERO_BUTTON, countdown: null });
  const [features, setFeatures] = useState([]);
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);

  useEffect(() => {
    fetchFeatures().then(({ features: f }) => setFeatures(f));
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    fetchHeroSlides().then(({ slides: s }) => setSlides(s || []));
    fetchHeroExtras().then((x) => setExtras(x)).catch(() => {});
  }, []);

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

      {features.length > 0 && (
        <div className="pt-8 md:pt-12">
          {features.map((f) => (f.kind === 'editorial'
            ? <Editorial key={f.id} f={f} isPhone={isPhone} />
            : <DropFeature key={f.id} f={f} isPhone={isPhone} />))}
        </div>
      )}
    </div>
  );
}
