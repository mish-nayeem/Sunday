import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { addToCart } from '@/lib/cartStore';
import { useToast } from '@/components/ui/use-toast';

export default function ProductCard({ product, index = 0 }) {
  const { toast } = useToast();
  const [hovered, setHovered] = useState(false);

  const handleQuickAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const defaultSize = product.sizes?.[0] || 'M';
    addToCart(product, defaultSize, 1);
    toast({ title: 'Added to bag', description: `${product.name} — Size ${defaultSize}` });
  };

  const badge = product.is_new_arrival ? 'NEW' : product.is_best_seller ? 'BEST SELLER' : null;
  const primaryImg = product.images?.[0];
  const secondaryImg = product.images?.[1] || primaryImg;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: (index % 4) * 0.08 }}
      className="group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`}>
        <div className="relative aspect-[3/4] overflow-hidden bg-mist mb-3 p-6 md:p-8">
          {badge && (
            <span className="absolute top-3 left-3 z-10 text-[10px] tracking-wider uppercase font-medium flex items-center gap-1">
              {badge} <span className="text-gold">★</span>
            </span>
          )}

          <img
            src={primaryImg}
            alt={product.name}
            className={`absolute inset-0 w-full h-full object-contain p-6 md:p-8 transition-opacity duration-500 ${hovered && secondaryImg !== primaryImg ? 'opacity-0' : 'opacity-100'}`}
          />
          {secondaryImg !== primaryImg && (
            <img
              src={secondaryImg}
              alt={product.name}
              className={`absolute inset-0 w-full h-full object-contain p-6 md:p-8 transition-opacity duration-500 ${hovered ? 'opacity-100' : 'opacity-0'}`}
            />
          )}

          {product.stock_status === 'out_of_stock' && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
              <span className="text-[11px] tracking-[0.15em] uppercase text-obsidian border border-obsidian px-3 py-1.5 bg-white">
                Sold Out
              </span>
            </div>
          )}

          {product.stock_status !== 'out_of_stock' && (
            <button
              onClick={handleQuickAdd}
              title="Quick add to cart"
              className="absolute bottom-3 right-3 z-10 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-obsidian hover:text-white transition-colors duration-300"
            >
              <Plus size={18} strokeWidth={2} />
            </button>
          )}
        </div>

        <h3 className="text-sm font-medium mb-1 truncate">{product.name}</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono">৳{product.price?.toLocaleString()}</span>
          {product.discount_percentage > 0 && product.original_price && (
            <span className="text-xs font-mono text-obsidian/40 line-through">
              ৳{product.original_price?.toLocaleString()}
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}