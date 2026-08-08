import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import GarmentRail from "./GarmentRail";

export default function HeroSection() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, price, images')
        .order('created_at', { ascending: false })
        .limit(16);
      setProducts(data || []);
    };
    load();
  }, []);

  return (
    <section className="relative bg-obsidian text-ivory overflow-hidden pt-14 pb-10 md:pt-20 md:pb-14">
      {/* Headline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 px-5 md:px-10 mb-10 md:mb-14"
      >
        <div className="max-w-[1440px] mx-auto">
          <p className="text-xs md:text-sm tracking-[0.3em] uppercase mb-2 text-ivory/70">
            Premium Menswear · Bangladesh
          </p>
          <h1 className="font-heading text-3xl md:text-6xl font-light tracking-[0.02em] mb-4 max-w-2xl">
            New Essential Collection
          </h1>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 text-xs md:text-sm uppercase tracking-[0.2em] border-b border-ivory/70 pb-1 hover:border-gold hover:text-gold transition-colors duration-300"
          >
            Shop Collection
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </motion.div>

      {/* Kinetic garment rail */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.3 }}
        className="relative"
      >
        <GarmentRail products={products} />
        {/* Edge fades so the rail reads as endless, not clipped */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 md:w-24 bg-gradient-to-r from-obsidian to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 md:w-24 bg-gradient-to-l from-obsidian to-transparent" />
      </motion.div>
    </section>
  );
}
