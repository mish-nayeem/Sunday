import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Heart } from 'lucide-react';
import { getWishlist } from '@/lib/cartStore';
import ProductCard from '@/components/products/ProductCard';

export default function Wishlist() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const ids = getWishlist();
      if (ids.length === 0) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.from('products').select('*').in('id', ids);
      setProducts(data || []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10">
        <div className="max-w-[1440px] mx-auto text-center">
          <p className="text-[11px] tracking-[0.3em] uppercase text-sand mb-3">Saved For Later</p>
          <h1 className="text-3xl md:text-4xl font-light tracking-wide">Your Wishlist</h1>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-10 md:py-16">
        {loading ? (
          <div className="flex justify-center py-32">
            <div className="w-8 h-8 border-2 border-sand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-32">
            <Heart size={40} strokeWidth={1} className="mx-auto text-charcoal/20 mb-4" />
            <p className="text-charcoal/40 tracking-wider text-sm mb-6">Your wishlist is empty</p>
            <Link
              to="/shop"
              className="inline-block border border-obsidian text-obsidian text-[11px] tracking-[0.2em] uppercase px-10 py-4 hover:bg-obsidian hover:text-white transition-all duration-500"
            >
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
            {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}