import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { Heart, Minus, Plus, Truck, Undo2, Shield, ChevronLeft } from 'lucide-react';
import { addToCart } from '@/lib/cartStore';
import { addRecentlyViewed, isInWishlist, toggleWishlist } from '@/lib/cartStore';
import ProductCard from '@/components/products/ProductCard';
import SizeChartPopup from '@/components/products/SizeChartPopup';
import ReviewsSection from '@/components/products/ReviewsSection';
import { useToast } from '@/components/ui/use-toast';

export default function ProductDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [wishlisted, setWishlisted] = useState(false);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
      if (!p) { setLoading(false); return; }
      setProduct(p);
      setWishlisted(isInWishlist(p.id));
      setSelectedSize(p.sizes?.[0] || '');
      setActiveImage(0);
      setQuantity(1);
      addRecentlyViewed(p.id);
      const { data: rel } = await supabase
        .from('products')
        .select('*')
        .eq('category', p.category)
        .order('created_at', { ascending: false })
        .limit(5);
      setRelated((rel || []).filter(r => r.id !== p.id).slice(0, 4));
      setLoading(false);
    };
    load();
    window.scrollTo(0, 0);
  }, [id]);

  const handleAddToCart = () => {
    if (!selectedSize) return;
    addToCart(product, selectedSize, quantity);
    toast({ title: 'Added to bag', description: `${product.name} — Size ${selectedSize}` });
  };

  const handleOrderNow = () => {
    if (!selectedSize) return;
    addToCart(product, selectedSize, quantity);
    window.location.href = '/checkout';
  };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="w-8 h-8 border-2 border-sand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-obsidian/40 mb-4">Product not found</p>
        <Link to="/shop" className="text-sm underline">Back to shop</Link>
      </div>
    );
  }

  const discount = product.discount_percentage > 0;
  const categoryLabels = { full_sleeve_shirts: 'Full Sleeve Shirts', half_sleeve_shirts: 'Half Sleeve Shirts', formal_shirts: 'Formal Shirts', polo: 'Polo', t_shirts: 'T-Shirts', cargo: 'Cargo', formal_pants: 'Formal Pants' };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.name,
        "description": product.description,
        "image": product.images,
        "brand": { "@type": "Brand", "name": "SUNDAY" },
        "offers": {
          "@type": "Offer",
          "price": product.price,
          "priceCurrency": "BDT",
          "availability": product.stock_status === 'out_of_stock' ? "https://schema.org/OutOfStock" : "https://schema.org/InStock"
        }
      }) }} />
      {/* Breadcrumb */}
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-4">
        <div className="flex items-center gap-2 text-[11px] tracking-wider text-obsidian/40">
          <Link to="/" className="hover:text-obsidian transition-colors">Home</Link>
          <span>/</span>
          <Link to="/shop" className="hover:text-obsidian transition-colors">Shop</Link>
          <span>/</span>
          <Link to={`/shop?category=${product.category}`} className="hover:text-obsidian transition-colors">
            {categoryLabels[product.category]}
          </Link>
          <span>/</span>
          <span className="text-obsidian">{product.name}</span>
        </div>
      </div>

      {/* Product */}
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 pb-20 md:pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
          {/* Gallery */}
          <div>
            <div
              className="relative aspect-[3/4] overflow-hidden bg-mist cursor-crosshair"
              onMouseEnter={() => setZoomed(true)}
              onMouseLeave={() => setZoomed(false)}
              onMouseMove={handleMouseMove}
            >
              <img
                src={product.images?.[activeImage]}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-300"
                style={zoomed ? {
                  transform: 'scale(2)',
                  transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`
                } : {}}
              />
              {discount && (
                <span className="absolute top-4 left-4 bg-burgundy text-white text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 font-mono font-bold">
                  -{product.discount_percentage}%
                </span>
              )}
            </div>
            {product.images?.length > 1 && (
              <div className="flex gap-2 mt-3">
                {product.images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`w-16 h-20 md:w-20 md:h-24 overflow-hidden border-2 transition-colors ${
                      activeImage === i ? 'border-obsidian' : 'border-transparent'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <p className="text-[11px] tracking-[0.3em] uppercase text-sand mb-2">
                {categoryLabels[product.category]}
              </p>
              <h1 className="text-2xl md:text-3xl font-light tracking-wide mb-4">{product.name}</h1>

              <div className="flex items-center gap-3 mb-6">
                <span className="text-xl font-mono font-medium">৳{product.price?.toLocaleString()}</span>
                {discount && product.original_price && (
                  <span className="text-sm font-mono text-obsidian/40 line-through">
                    ৳{product.original_price?.toLocaleString()}
                  </span>
                )}
                {product.stock_status === 'low_stock' && (
                  <span className="text-[10px] tracking-wider uppercase text-red-500 border border-red-200 px-2 py-0.5">Low Stock</span>
                )}
                {product.stock_status === 'out_of_stock' && (
                  <span className="text-[10px] tracking-wider uppercase text-obsidian/40 border border-obsidian/20 px-2 py-0.5">Sold Out</span>
                )}
              </div>

              <div className="h-px bg-sand/30 mb-6" />

              <p className="text-sm text-obsidian/60 leading-relaxed mb-8">{product.description}</p>

              {/* Size */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] tracking-[0.2em] uppercase font-medium">Size</span>
                  <button
                    onClick={() => setSizeChartOpen(true)}
                    className="text-[11px] tracking-wider text-sand hover:text-obsidian underline transition-colors"
                  >
                    Size Guide
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.sizes?.map(size => {
                    const sizeStock = product.size_stock?.[size];
                    const available = product.size_stock
                      ? (sizeStock || 0) > 0
                      : (product.quantity || 0) > 0;
                    return (
                      <button
                        key={size}
                        onClick={() => available && setSelectedSize(size)}
                        disabled={!available}
                        className={`min-w-[48px] h-12 px-4 border text-sm tracking-wider transition-all duration-300 ${
                          !available
                            ? 'border-charcoal/10 text-charcoal/20 cursor-not-allowed line-through'
                            : selectedSize === size
                              ? 'bg-wine text-white border-wine'
                              : 'border-charcoal/20 hover:border-charcoal'
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantity */}
              <div className="mb-8">
                <span className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-3">Quantity</span>
                <div className="flex items-center border border-obsidian/20 w-fit">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-12 h-12 flex items-center justify-center hover:bg-mist transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-12 h-12 flex items-center justify-center text-sm font-mono">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-12 h-12 flex items-center justify-center hover:bg-mist transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mb-6">
                <button
                  onClick={handleOrderNow}
                  disabled={product.stock_status === 'out_of_stock'}
                  className="flex-1 bg-wine text-white text-[11px] tracking-[0.2em] uppercase py-4 hover:bg-wine/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Order Now
                </button>
                <button
                  onClick={handleAddToCart}
                  disabled={product.stock_status === 'out_of_stock'}
                  className="flex-1 border border-obsidian text-[11px] tracking-[0.2em] uppercase py-4 hover:bg-mist transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add to Bag
                </button>
                <button
                  onClick={() => {
                    toggleWishlist(product.id);
                    setWishlisted(!wishlisted);
                  }}
                  className="w-12 h-12 border border-obsidian/20 flex items-center justify-center hover:border-obsidian transition-colors"
                >
                  <Heart size={18} strokeWidth={1.5} fill={wishlisted ? '#111' : 'none'} />
                </button>
              </div>

              {/* COD Badge */}
              <div className="bg-mist p-4 mb-8">
                <div className="flex items-center gap-3">
                  <Truck size={20} strokeWidth={1} className="text-sand" />
                  <div>
                    <p className="text-sm font-medium">Cash on Delivery</p>
                    <p className="text-xs text-obsidian/50">Available all over Bangladesh. Pay when you receive.</p>
                  </div>
                </div>
              </div>

              {/* Details */}
              {product.details && (
                <div className="border-t border-sand/30 pt-6 mb-6">
                  <h3 className="text-[11px] tracking-[0.2em] uppercase font-medium mb-3">Details</h3>
                  <p className="text-sm text-obsidian/60 leading-relaxed whitespace-pre-line">{product.details}</p>
                </div>
              )}

              {product.fabric && (
                <div className="border-t border-sand/30 pt-6 mb-6">
                  <h3 className="text-[11px] tracking-[0.2em] uppercase font-medium mb-3">Fabric</h3>
                  <p className="text-sm text-obsidian/60">{product.fabric}</p>
                </div>
              )}

              {product.care_instructions && (
                <div className="border-t border-sand/30 pt-6">
                  <h3 className="text-[11px] tracking-[0.2em] uppercase font-medium mb-3">Care</h3>
                  <p className="text-sm text-obsidian/60">{product.care_instructions}</p>
                </div>
              )}

              {/* Trust badges */}
              <div className="border-t border-sand/30 pt-6 mt-6 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <Truck size={18} strokeWidth={1} className="mx-auto text-sand mb-2" />
                  <p className="text-[10px] tracking-wider uppercase text-obsidian/50">Free Shipping</p>
                </div>
                <div className="text-center">
                  <Undo2 size={18} strokeWidth={1} className="mx-auto text-sand mb-2" />
                  <p className="text-[10px] tracking-wider uppercase text-obsidian/50">Easy Returns</p>
                </div>
                <div className="text-center">
                  <Shield size={18} strokeWidth={1} className="mx-auto text-sand mb-2" />
                  <p className="text-[10px] tracking-wider uppercase text-obsidian/50">Quality Assured</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-20 md:mt-32 border-t border-sand/30 pt-16">
            <h2 className="text-2xl md:text-3xl font-light tracking-wide text-center mb-12">You May Also Like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {related.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          </div>
        )}
      </div>

      {/* Reviews */}
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 pb-20 md:pb-32">
        <ReviewsSection product={product} />
      </div>

      <SizeChartPopup open={sizeChartOpen} onClose={() => setSizeChartOpen(false)} category={product.category} />
    </div>
  );
}