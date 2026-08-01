import React from 'react';
import { Link } from 'react-router-dom';

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-mist px-5 py-16">
      <div className="w-full max-w-md bg-card p-8 md:p-10 rounded-lg shadow-sm">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block mb-6">
            <p className="text-xl font-black tracking-[0.15em] text-obsidian">SUNDAY</p>
          </Link>
          {Icon && (
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Icon className="w-6 h-6 text-primary" />
            </div>
          )}
          <h1 className="text-xl font-medium mb-1">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
        {footer && <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>}
      </div>
    </div>
  );
}
