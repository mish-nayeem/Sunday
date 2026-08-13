import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Plus } from 'lucide-react';
import { toggleWishlist, isInWishlist, addToCart, openCartDrawer } from '@/lib/cartStore';

export default function ProductCard({ product, index = 0 }) {
  const [wishlisted, setWishlisted] = React.useState(false);
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setWishlisted(isInWishlist(product.id));
  }, [product.id]);

  const discount = product.discount_percentage > 0;
  const isNew = product.is_new_arrival;

  const handleQuickAdd = (e) => {
    e.preventDefault();
    const size = product.sizes?.[0];
    if (!size) {
      window.location.href = `/product/${product.id}`;
      return;
    }
    addToCart(product, size, 1);
    openCartDrawer();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: (index % 4) * 0.08 }}
      className="group relative"
    >
      <Link to={`/product/${product.id}`}>
      <div className="relative aspect-[3/4] overflow-hidden bg-[#f5f5f5] mb-3">
          {product.images?.[0] && !imgError ? (
            <img
              src={product.images[0]}
              alt={product.name}
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-obsidian/20">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23Z" />
              </svg>
            </div>
          )}
          {isNew && (
            <span className="absolute top-3 left-3 text-[10px] tracking-wider uppercase text-obsidian/70 flex items-center gap-1">
              New <span className="text-[8px]">★</span>
            </span>
          )}
          {discount && (
            <span className="absolute top-3 left-3 bg-burgundy text-white text-[10px] tracking-wider uppercase px-2 py-1 font-mono">
              -{product.discount_percentage}%
            </span>
          )}
          {product.stock_status === 'out_of_stock' && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <span className="text-[11px] tracking-[0.15em] uppercase text-obsidian border border-obsidian px-3 py-1.5 bg-white">
                Sold Out
              </span>
            </div>
          )}
          <button
            onClick={(e) => {
              e.preventDefault();
              toggleWishlist(product.id);
              setWishlisted(!wishlisted);
            }}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Heart size={14} fill={wishlisted ? '#111' : 'none'} />
          </button>
          {product.stock_status !== 'out_of_stock' && (
            <button
              onClick={handleQuickAdd}
              aria-label="Quick add to bag"
              className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm hover:bg-obsidian hover:text-white transition-colors"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        <p className="text-[10px] tracking-wider uppercase text-obsidian/40 mb-1">
          {product.category?.replace(/_/g, ' ')}
        </p>
        <h3 className="text-sm font-medium mb-1 truncate font-body">{product.name}</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono">৳{product.price?.toLocaleString()}</span>
          {discount && product.original_price && (
            <span className="text-xs font-mono text-obsidian/40 line-through">
              ৳{product.original_price?.toLocaleString()}
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
