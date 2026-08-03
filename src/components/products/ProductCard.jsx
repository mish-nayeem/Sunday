import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';

export default function ProductCard({ product, index = 0 }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);

  const images = product.images?.length ? product.images : [null];
  const hasMultipleImages = images.length > 1;

  const goPrevImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIndex((i) => (i - 1 + images.length) % images.length);
  };

  const goNextImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIndex((i) => (i + 1) % images.length);
  };

  const handleQuickAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/product/${product.id}`);
  };

  const currentImg = images[imgIndex];

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
        <div className="relative aspect-[3/4] overflow-hidden bg-mist mb-3 p-2 md:p-3">
          <img
            src={currentImg}
            alt={product.name}
            className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300"
          />

          {hasMultipleImages && (
            <>
              <button
                onClick={goPrevImage}
                aria-label="Previous image"
                className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/80 shadow flex items-center justify-center hover:bg-white transition-colors duration-300"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goNextImage}
                aria-label="Next image"
                className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/80 shadow flex items-center justify-center hover:bg-white transition-colors duration-300"
              >
                <ChevronRight size={16} />
              </button>

              {/* Dots showing which image is active */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1">
                {images.map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                      i === imgIndex ? 'bg-obsidian' : 'bg-obsidian/30'
                    }`}
                  />
                ))}
              </div>
            </>
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
              title="View product"
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