import React, { useEffect, useState } from 'react';
import { fetchFooterAbout, DEFAULT_FOOTER_ABOUT } from '@/admin/lib/siteSettings.js';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { SECTIONS } from '@/lib/catalog';
import logo from '@/assets/logo.png';

const COLUMNS = [
  {
    title: 'Shop',
    links: [{ to: '/shop', label: 'Shop all' }, ...SECTIONS.map((s) => ({ to: `/shop?category=${s.key}`, label: s.label }))],
  },
  {
    title: 'Help',
    links: [
      { to: '/order-tracking', label: 'Track an order' },
      { to: '/support/portal', label: 'Returns and exchanges' },
      { to: '/support/delivery', label: 'Delivery' },
      { to: '/support/size-guide', label: 'Size guide' },
      { to: '/faq', label: 'FAQ' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Policies',
    links: [
      { to: '/support/refunds', label: 'Refund policy' },
      { to: '/support/portal', label: 'Return and exchange policy' },
      { to: '/support/delivery', label: 'Delivery policy' },
      { to: '/support/privacy', label: 'Privacy policy' },
      { to: '/support/terms', label: 'Terms of service' },
      { to: '/about', label: 'About SUNDAY' },
    ],
  },
];

const SOCIAL = [
  { href: 'https://www.instagram.com/sunday.clothin?igsh=MWhyZzNpZzNod2xsZQ==', label: 'Instagram' },
  { href: 'https://www.facebook.com/share/19U1FfCwMY/', label: 'Facebook' },
];

// One footer group, folded away behind a thin plus: hovering it (with a
// mouse) or tapping it (on a phone) opens its links.
function FooterGroup({ col }) {
  const [open, setOpen] = useState(false);
  const canHover = () => window.matchMedia('(hover: hover)').matches;
  return (
    <div onMouseEnter={() => canHover() && setOpen(true)} onMouseLeave={() => canHover() && setOpen(false)}>
      <button
        type="button"
        onClick={() => !canHover() && setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-3 text-[11px] uppercase tracking-[0.16em] py-1"
      >
        {col.title}
        <span aria-hidden="true" className={`inline-block text-[16px] font-light leading-none text-graphite transition-transform duration-300 ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <ul className="overflow-hidden space-y-2" aria-hidden={!open}>
          <li className="h-2" aria-hidden="true" />
          {col.links.map((l) => (
            <li key={l.to + l.label}>
              <Link to={l.to} tabIndex={open ? 0 : -1} className="text-graphite hover:text-ink hover:underline underline-offset-4">{l.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Footer() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  // The heading and line over the sign-up — Admin → Homepage → Footer text.
  const [about, setAbout] = useState(DEFAULT_FOOTER_ABOUT);
  useEffect(() => { fetchFooterAbout().then(setAbout).catch(() => {}); }, []);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    const { error } = await supabase.from('newsletter_subscribers').insert({ email: email.trim() });
    setStatus(error ? 'error' : 'done');
    if (!error) setEmail('');
  };

  return (
    <footer className="border-t border-rule mt-auto px-4 md:px-6 pt-12 pb-8 text-[13px]">
      {/* The newsletter, then SHOP / HELP / POLICIES under it, on the left;
          the big faded SUNDAY logo beside them on the right. */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-10">
        <div className="flex flex-col gap-10 md:flex-1 md:min-w-0">
        <div className="max-w-sm">
          <p className="font-heading text-[22px] leading-tight mb-2">{about.heading}</p>
          <p className="text-graphite mb-4 whitespace-pre-line">{about.text}</p>
          {status === 'done' ? (
            <p>You’re on the list.</p>
          ) : (
            <form onSubmit={handleSubscribe} className="flex border-b border-ink">
              <label htmlFor="footer-email" className="sr-only">Email address</label>
              <input
                id="footer-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="flex-1 min-w-0 bg-transparent py-2 outline-none placeholder:text-graphite"
              />
              <button type="submit" disabled={status === 'sending'} className="pl-4 py-2 hover:underline underline-offset-4">
                Sign up
              </button>
            </form>
          )}
          {status === 'error' && <p className="mt-2 text-coral">That didn’t go through. Check the address and try again.</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 content-start max-w-xl">
          {COLUMNS.map((col) => <FooterGroup key={col.title} col={col} />)}
        </div>
        </div>

        {/* No colour, just a soft grey shade of the header's mark. */}
        <img
          src={logo}
          alt=""
          aria-hidden="true"
          className="block self-end md:self-center w-[70%] sm:w-[50%] md:w-[44%] max-w-[640px] h-auto brightness-0 opacity-[0.08] select-none pointer-events-none"
          loading="lazy"
        />
      </div>

      <div className="mt-14 pt-5 border-t border-rule flex flex-col sm:flex-row gap-3 sm:items-center justify-between text-graphite">
        <p>© {new Date().getFullYear()} SUNDAY, Bangladesh</p>
        {/* Clear of the round chat button fixed in the corner. */}
        <ul className="flex gap-5 sm:pr-16">
          {SOCIAL.map((s) => (
            <li key={s.label}>
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="hover:text-ink hover:underline underline-offset-4">{s.label}</a>
            </li>
          ))}
        </ul>
      </div>

    </footer>
  );
}
