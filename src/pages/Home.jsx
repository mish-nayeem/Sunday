import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { imgUrl } from '@/lib/storage';
import { SECTIONS } from '@/lib/catalog';
import ProductCard from '@/components/products/ProductCard';
import heroImage from '@/assets/hero.jpeg';
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
  const lead = newArrivals[0];
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

      {/* Opening spread: campaign photo beside the newest piece */}
      <section className="grid md:grid-cols-2 gap-1">
        <Link to="/shop?filter=new_arrival" className="group block">
          <div className="aspect-[4/5] md:aspect-auto md:h-[calc(100vh-6rem)] md:min-h-[560px] bg-stone overflow-hidden">
            <img src={heroImage} alt="SUNDAY new arrivals" className="w-full h-full object-cover" fetchpriority="high" />
          </div>
        </Link>
        <Link to={lead ? `/product/${lead.id}` : '/shop'} className="group hidden md:block">
          <div className="h-[calc(100vh-6rem)] min-h-[560px] bg-stone overflow-hidden">
            {lead?.images?.[0] && (
              <img src={imgUrl(lead.images[0], 1000)} alt={lead.name} className="w-full h-full object-cover" />
            )}
          </div>
        </Link>
      </section>
      <div className="px-4 md:px-6 pt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="font-heading text-[30px] md:text-[40px] leading-tight">Everyday feels like Sunday</h1>
        <Link to="/shop?filter=new_arrival" className="text-[13px] underline underline-offset-4">Shop new arrivals</Link>
      </div>

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
