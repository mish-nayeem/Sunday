import React from 'react';
import { motion } from 'framer-motion';

export default function SectionHeader({ label, title, align = 'center', size = 'md' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className={`mb-10 md:mb-14 ${align === 'center' ? 'text-center' : ''}`}
    >
      {label && <p className="text-[11px] tracking-[0.3em] uppercase text-sand mb-2">{label}</p>}
      <h2 className={size === 'lg' ? 'text-3xl md:text-5xl font-light tracking-wide' : 'text-2xl md:text-4xl font-light tracking-wide'}>
        {title}
      </h2>
    </motion.div>
  );
}
