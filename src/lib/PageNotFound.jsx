import React from 'react';
import { Link } from 'react-router-dom';

export default function PageNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 text-center">
      <p className="text-6xl font-light tracking-wide text-charcoal/20 mb-4">404</p>
      <h1 className="text-xl md:text-2xl font-light tracking-wide mb-3">Page Not Found</h1>
      <p className="text-sm text-charcoal/50 mb-8">The page you're looking for doesn't exist.</p>
      <Link
        to="/"
        className="inline-block border border-obsidian text-obsidian text-[11px] tracking-[0.2em] uppercase px-8 py-3 hover:bg-obsidian hover:text-white transition-all duration-300"
      >
        Back to Home
      </Link>
    </div>
  );
}
