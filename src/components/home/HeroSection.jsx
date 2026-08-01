import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import heroImage from "../../assets/hero.jpeg";

export default function HeroSection() {
  return (
    <section
      className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden text-white"
      style={{
        backgroundImage: `url(${heroImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 text-center px-5"
      >
        <p className="text-xs md:text-sm tracking-[0.35em] uppercase mb-4 text-white/80">
          Premium Menswear · Bangladesh
        </p>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-light tracking-[0.15em] mb-6">
          SUNDAY
        </h1>

        <p className="max-w-xl mx-auto text-base md:text-lg text-white/80 leading-relaxed mb-10">
          Elevate your everyday style with premium shirts, polos and formal
          wear crafted for modern gentlemen.
        </p>

        <Link
          to="/shop"
          className="inline-block border border-white px-10 py-4 uppercase tracking-[0.2em] text-xs hover:bg-white hover:text-black transition-all duration-300"
        >
          Shop Collection
        </Link>
      </motion.div>
    </section>
  );
}