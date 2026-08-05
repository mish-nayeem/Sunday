import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import SectionHeader from '@/components/ui/SectionHeader';
import ProductCard from '@/components/products/ProductCard';
import HeroSection from '@/components/home/HeroSection';
import FeaturedBanners from '@/components/home/FeaturedBanners';
import CategoriesSection from '@/components/home/CategoriesSection';
import WhyChooseSection from '@/components/home/WhyChooseSection';
import ReviewsSection from '@/components/home/ReviewsSection';
import InstagramSection from '@/components/home/InstagramSection';

export default function Home() {
  const [featured, setFeatured] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: all } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      const products = all || [];
      setFeatured(products.filter((p) => p.is_featured));
      setNewArrivals(products.filter((p) => p.is_new_arrival));
      setBestSellers(products.filter((p) => p.is_best_seller).slice(0, 4));
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "SUNDAY",
        "url": "https://sunday.com.bd",
        "potentialAction": {
          "@type": "SearchAction",
          "target": "https://sunday.com.bd/shop?search={search_term_string}",
          "query-input": "required name=search_term_string"
        }
      }) }} />
      <HeroSection />

      {/* Featured Collection */}
      <section className="py-20 md:py-32 px-5 md:px-10">
        <div className="max-w-[1440px] mx-auto">
          <SectionHeader label="Curated Selection" title="Featured Collection" align="left" size="lg" />
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-sand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : featured.length > 0 ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
              {featured.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          ) : null}
        </div>
      </section>

      <FeaturedBanners />

      {/* Divider */}
      <div className="max-w-[1440px] mx-auto px-5 md:px-10">
        <div className="h-px bg-sand/30" />
      </div>

      {/* New Arrivals */}
      <section className="py-20 md:py-32 px-5 md:px-10">
        <div className="max-w-[1440px] mx-auto">
          <SectionHeader label="Just Landed" title="New Arrivals" align="left" size="lg" />
          {!loading && newArrivals.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 md:gap-3">
              {newArrivals.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          )}
        </div>
      </section>

      <CategoriesSection />

      {/* Best Sellers */}
      <section className="py-20 md:py-32 px-5 md:px-10 bg-mist">
        <div className="max-w-[1440px] mx-auto">
          <SectionHeader label="Most Loved" title="Best Sellers" />
          {!loading && bestSellers.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {bestSellers.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          )}
        </div>
      </section>

      <WhyChooseSection />
      <ReviewsSection />
      <InstagramSection />
    </div>
  );
}
