import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import heroImage from "../../assets/hero.jpeg";

export default function HeroSection() {
  return (
    <section
      className="relative h-screen min-h-[560px] flex items-center justify-center overflow-hidden text-white"
      style={{
        backgroundImage: `url(${heroImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Subtle gradient for text legibility */}
      <div className="absolute inset-0 bg-black/10" />

      {/* Content — dead center, transparent background */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10"
      >
        <Link
          to="/shop"
          className="inline-flex items-center gap-2 text-base md:text-xl uppercase tracking-[0.35em] border-b border-white/70 pb-2 hover:border-white hover:text-sand transition-colors duration-300"
        >
          Shop Now
        </Link>
      </motion.div>
    </section>
  );
}
