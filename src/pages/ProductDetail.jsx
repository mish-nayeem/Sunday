import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { cloudinaryOptimized } from '@/lib/cloudinaryOptimized';
import { motion } from 'framer-motion';
import { Heart, Truck, Share2, HelpCircle } from 'lucide-react';
import { addToCart, openCartDrawer } from '@/lib/cartStore';
import { addRecentlyViewed, isInWishlist, toggleWishlist } from '@/lib/cartStore';
import ProductCard from '@/components/products/ProductCard';
import SizeChartPopup from '@/components/products/SizeChartPopup';

// Collapsible row used for Size recommends / Details / Care / Shipping policy
function AccordionRow({ title, children }) {
  const [open, setOpen] = useState(false);
  if (!children) return null;
  return (
    <div className="bg-[#FFFBEA] rounded-xl px-4 mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left"
      >
        <span className="text-[11px] tracking-wide uppercase font-medium text-black">{title}</span>
        <span className="text-lg leading-none text-black">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="pb-4 text-sm text-black/60 leading-relaxed whitespace-pre-line">
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
  const [selectedColor, setSelectedColor] = useState('');
  const [wishlisted, setWishlisted] = useState(false);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: p } = await supabase.from('products').select('*').eq('id', id).single();
      if (!p) { setLoading(false); return; }
      setProduct(p);
      setWishlisted(isInWishlist(p.id));
      setSelectedSize(p.sizes?.[0] || '');
      setSelectedColor(p.colors?.[0] || '');
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
    addToCart(product, selectedSize, 1);
    openCartDrawer();
  };

  const handleBuyNow = () => {
    if (!selectedSize) return;
    addToCart(product, selectedSize, 1);
    navigate('/checkout');
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch (e) { /* share cancelled or clipboard unavailable */ }
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
                    src={cloudinaryOptimized(img, 900)}
                    alt={`${product.name} ${i + 1}`}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
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
                    <img src={cloudinaryOptimized(img, 100)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="text-lg md:text-xl font-bold tracking-wide uppercase font-body">{product.name}</h1>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 text-xs text-black/60 hover:text-black underline shrink-0 mt-1"
                >
                  <Share2 size={13} /> {shareCopied ? 'Copied!' : 'Share'}
                </button>
              </div>

              <div className="text-xs text-black/50 space-y-0.5 mb-4">
                {product.sku && <p>SKU: <span className="text-black/70">{product.sku}</span></p>}
                <p>Product Type: <span className="text-black/70">{categoryLabels[product.category]}</span></p>
              </div>

              <div className="flex items-center gap-3 mb-6">
                <span className="text-base font-mono font-semibold">Tk {product.price?.toLocaleString()}.00</span>
                <span className="text-xs text-black/40">+ VAT</span>
                {discount && product.original_price && (
                  <span className="text-sm font-mono text-black/40 line-through">
                    ৳{product.original_price?.toLocaleString()}
                  </span>
                )}
                {product.stock_status === 'low_stock' && (
                  <span className="text-[10px] tracking-wider uppercase text-red-500 border border-red-200 px-2 py-0.5 rounded-full">Low Stock</span>
                )}
                {product.stock_status === 'out_of_stock' && (
                  <span className="text-[10px] tracking-wider uppercase text-black/40 border border-black/20 px-2 py-0.5 rounded-full">Sold Out</span>
                )}
              </div>

              {/* Color */}
              {product.colors?.length > 0 && (
                <div className="mb-6">
                  <span className="text-[11px] tracking-wide uppercase font-medium block mb-3 text-black">
                    Color{selectedColor ? ` - ${selectedColor}` : ''}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map(color => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`px-3 h-9 rounded-xl border text-xs transition-all ${
                          selectedColor === color
                            ? 'bg-black text-white border-black'
                            : 'border-black/20 bg-[#FFFBEA] hover:border-black text-black'
                        }`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Size */}
              <div className="mb-3">
                <span className="text-[11px] tracking-wide uppercase font-medium block mb-3 text-black">Size</span>
                <div className="flex flex-wrap gap-2">
                  {product.sizes?.map(size => {
                    const sizeStock = product.size_stock?.[size];
                    const hasSizeStockData = product.size_stock && Object.keys(product.size_stock).length > 0;
                    const available = hasSizeStockData
                      ? (sizeStock || 0) > 0
                      : (product.quantity || 0) > 0;
                    return (
                      <button
                        key={size}
                        onClick={() => available && setSelectedSize(size)}
                        disabled={!available}
                        className={`w-11 h-11 rounded-full border text-xs tracking-wider transition-all duration-300 ${
                          !available
                            ? 'border-black/10 text-black/20 cursor-not-allowed line-through'
                            : selectedSize === size
                              ? 'bg-black text-white border-black'
                              : 'border-black/30 bg-[#FFFBEA] hover:border-black text-black'
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accordion sections */}
              <div className="mt-6 mb-6">
                <button
                  onClick={() => setSizeChartOpen(true)}
                  className="w-full flex items-center justify-between py-4 text-left border-t border-black/10"
                >
                  <span className="text-[11px] tracking-wide uppercase font-medium text-black">Size Guide</span>
                  <span className="text-lg leading-none text-black">+</span>
                </button>
                <AccordionRow title="Description">
                  {[product.description, product.details, product.care_instructions].filter(Boolean).join('\n\n')}
                </AccordionRow>
              </div>

              {/* Free shipping note */}
              <div className="flex items-center gap-2 mb-6 text-xs text-black/70">
                <Truck size={16} className="text-black/60" />
                <span>Free shipping on orders over ৳3,500</span>
                <span title="Cash on Delivery available across Bangladesh. Advance bKash payment required outside Dhaka.">
                  <HelpCircle size={13} className="text-black/40 cursor-help" />
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={handleAddToCart}
                  disabled={product.stock_status === 'out_of_stock'}
                  className="flex-1 bg-[#FFFBEA] text-black text-[11px] tracking-wide uppercase py-4 rounded-xl border border-black/10 shadow-sm flex items-center justify-center gap-2 hover:bg-[#FFF3D0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add to Cart · Tk {product.price?.toLocaleString()}.00
                </button>
                <button
                  onClick={() => {
                    toggleWishlist(product.id);
                    setWishlisted(!wishlisted);
                  }}
                  className="w-12 h-12 flex-shrink-0 border border-black/20 rounded-xl bg-[#FFFBEA] flex items-center justify-center hover:border-black transition-colors"
                >
                  <Heart size={18} strokeWidth={1.5} className="text-black" fill={wishlisted ? '#111' : 'none'} />
                </button>
              </div>

              <button
                onClick={handleBuyNow}
                disabled={product.stock_status === 'out_of_stock'}
                className="w-full bg-[#FF7254] text-white text-[11px] tracking-wide uppercase py-4 rounded-xl hover:bg-[#FF7254]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Buy It Now
              </button>
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
