import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { Heart, Minus, Plus, Truck, Undo2, Shield, ChevronDown } from 'lucide-react';
import { addToCart } from '@/lib/cartStore';
import { addRecentlyViewed, isInWishlist, toggleWishlist } from '@/lib/cartStore';
import ProductCard from '@/components/products/ProductCard';
import SizeChartPopup from '@/components/products/SizeChartPopup';

// Collapsible row used for Size recommends / Details / Care / Shipping policy
function AccordionRow({ title, children }) {
  const [open, setOpen] = useState(false);
  if (!children) return null;
  return (
    <div className="border-t border-sand/30">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left"
      >
        <span className="text-[11px] tracking-[0.15em] uppercase font-medium">{title}</span>
        <span className="text-lg leading-none">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="pb-4 text-sm text-obsidian/60 leading-relaxed whitespace-pre-line">
          {children}
        </div>
      )}
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [wishlisted, setWishlisted] = useState(false);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
      if (!p) { setLoading(false); return; }
      setProduct(p);
      setWishlisted(isInWishlist(p.id));
      setSelectedSize(p.sizes?.[0] || '');
      setQuantity(1);
      addRecentlyViewed(p.id);
      const { data: rel } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(9);
      setRelated((rel || []).filter(r => r.id !== p.id).slice(0, 8));
      setLoading(false);
    };
    load();
    window.scrollTo(0, 0);
  }, [id]);

  const handleAddToCart = () => {
    if (!selectedSize) return;
    addToCart(product, selectedSize, quantity);
    navigate('/checkout');
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
  const images = product.images?.length ? product.images : [null];

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
      <div className="max-w-[1600px] mx-auto px-5 md:px-10 pb-20 md:pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 lg:gap-16 items-start">
          {/* Left column — gallery + thumbnails */}
          <div>
            <div className={`grid gap-2 auto-rows-max ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {images.map((img, i) => (
                <div key={i} className="relative aspect-[3/4] overflow-hidden bg-mist">
                  <img
                    src={img}
                    alt={`${product.name} ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {i === 0 && discount && (
                    <span className="absolute top-4 left-4 bg-burgundy text-white text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 font-mono font-bold">
                      -{product.discount_percentage}%
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Small thumbnails of the same gallery images, below the main gallery */}
            {images.length > 1 && (
              <div className="flex gap-2 mt-2">
                {images.map((img, i) => (
                  <div key={i} className="w-12 h-14 overflow-hidden bg-mist border border-obsidian/10">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </div>
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
              <h1 className="text-lg md:text-xl font-bold tracking-wide uppercase mb-2">{product.name}</h1>

              <div className="flex items-center gap-3 mb-6">
                <span className="text-base font-mono">Tk {product.price?.toLocaleString()}.00</span>
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

              {/* Size */}
              <div className="mb-3">
                <span className="text-[11px] tracking-[0.15em] uppercase font-medium block mb-3">Size</span>
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
                        className={`min-w-[44px] h-10 px-3 border text-xs tracking-wider transition-all duration-300 ${
                          !available
                            ? 'border-charcoal/10 text-charcoal/20 cursor-not-allowed line-through'
                            : selectedSize === size
                              ? 'bg-obsidian text-white border-obsidian'
                              : 'border-charcoal/30 hover:border-charcoal'
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setSizeChartOpen(true)}
                className="text-[11px] tracking-wider text-obsidian/60 hover:text-obsidian underline transition-colors mb-6 inline-block"
              >
                Size Guide
              </button>

              {/* Quantity */}
              <div className="mb-6">
                <span className="text-[11px] tracking-[0.15em] uppercase font-medium block mb-3">Quantity</span>
                <div className="flex items-center border border-obsidian/20 w-fit">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 flex items-center justify-center hover:bg-mist transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-10 h-10 flex items-center justify-center text-sm font-mono">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-mist transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Delivery / COD bullets */}
              <div className="space-y-2 mb-6 text-xs text-obsidian/70">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
                  <span>Cash on Delivery available</span>
                </div>
                <div className="flex items-center gap-2">
                  <Truck size={14} className="text-obsidian/50" />
                  <span>Free shipping on orders over ৳3,500</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mb-8">
                <button
                  onClick={handleAddToCart}
                  disabled={product.stock_status === 'out_of_stock'}
                  className="flex-1 bg-obsidian text-white text-[11px] tracking-[0.2em] uppercase py-4 flex items-center justify-center gap-2 hover:bg-obsidian/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add to Cart · Tk {product.price?.toLocaleString()}.00
                </button>
                <button
                  onClick={() => {
                    toggleWishlist(product.id);
                    setWishlisted(!wishlisted);
                  }}
                  className="w-12 h-12 flex-shrink-0 border border-obsidian/20 flex items-center justify-center hover:border-obsidian transition-colors"
                >
                  <Heart size={18} strokeWidth={1.5} fill={wishlisted ? '#111' : 'none'} />
                </button>
              </div>

              {product.description && (
                <p className="text-sm text-obsidian/60 leading-relaxed mb-2">{product.description}</p>
              )}

              {/* Accordion sections */}
              <div className="mt-4">
                <AccordionRow title="Size recommends">
                  Not sure about your fit? Check the size guide above, or compare with your usual size — this piece runs true to size.
                </AccordionRow>
                <AccordionRow title="Details">
                  {product.details}
                </AccordionRow>
                <AccordionRow title="Care">
                  {product.care_instructions}
                </AccordionRow>
                <AccordionRow title="Shipping policy">
                  {"Cash on Delivery is available across Bangladesh. Orders are typically delivered within 3–5 business days inside Dhaka and 5–7 business days outside Dhaka."}
                </AccordionRow>
              </div>

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

      <SizeChartPopup open={sizeChartOpen} onClose={() => setSizeChartOpen(false)} category={product.category} />
    </div>
  );
}
