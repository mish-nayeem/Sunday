import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import heroImage from "../../assets/hero.jpeg";

export default function HeroSection() {
  return (
    <section
      className="relative h-[45vh] min-h-[320px] md:h-[60vh] md:min-h-[560px] flex items-end overflow-hidden text-white"
      style={{
        backgroundImage: `url(${heroImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Subtle bottom-left gradient for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

      {/* Content — bottom-left aligned */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 px-5 md:px-10 pb-10 md:pb-14 w-full"
      >
        <div className="max-w-[1440px] mx-auto">
          <p className="text-xs md:text-sm tracking-[0.3em] uppercase mb-2 text-white/85">
            Premium Menswear · Bangladesh
          </p>
          <h1 className="text-2xl md:text-4xl font-light tracking-[0.1em] mb-3">
            New Essential Collection
          </h1>
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 text-xs md:text-sm uppercase tracking-[0.2em] border-b border-white/70 pb-1 hover:border-white hover:text-sand transition-colors duration-300"
          >
            Shop Collection
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
