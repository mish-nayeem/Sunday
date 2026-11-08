import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchFooterAbout, DEFAULT_FOOTER_ABOUT } from '@/admin/lib/siteSettings.js';
import { supabase } from '@/lib/supabaseClient';

// One quiet band: the sign-up on the left, a single row of links on the
// right — each opens its own page (Support opens the support pages with
// their tab row) — and the small print underneath.

const LINKS = [
  { to: '/order-tracking', label: 'Track order' },
  { to: '/support', label: 'Support' },
  { to: '/support/portal', label: 'Returns & exchanges' },
  { to: '/support/privacy', label: 'Privacy policy' },
  { to: '/support/terms', label: 'Terms of service' },
  { to: '/about', label: 'About' },
];

const SOCIAL = [
  { href: 'https://www.instagram.com/sunday.clothin?igsh=MWhyZzNpZzNod2xsZQ==', label: 'Instagram' },
  { href: 'https://www.facebook.com/share/19U1FfCwMY/', label: 'Facebook' },
];

const linkCls = 'whitespace-nowrap text-[11px] uppercase tracking-[0.12em] text-ink hover:text-coral transition-colors';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [message, setMessage] = useState('');
  // The label and line by the sign-up — Admin → Homepage → Footer text.
  const [about, setAbout] = useState(DEFAULT_FOOTER_ABOUT);
  useEffect(() => { fetchFooterAbout().then(setAbout).catch(() => {}); }, []);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }
    setStatus('sending');
    setMessage('');
    const { error } = await supabase.from('newsletter_subscribers').insert({ email: value });
    // Already on the list is fine from the shopper's side.
    if (error && error.code !== '23505') {
      setStatus('error');
      setMessage('That didn’t go through. Try again in a moment.');
      return;
    }
    setStatus('done');
    setMessage(error ? 'You’re already on the list.' : 'You’re on the list.');
    setEmail('');
  };

  return (
    <footer className="mt-auto px-4 md:px-6 pb-4 text-[13px]">
      <div className="border-t border-rule pt-6 md:pt-7 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 lg:gap-8">
        {/* Sign-up */}
        <div className="w-full lg:max-w-[340px] lg:shrink-0">
          <label htmlFor="footer-email" className="block text-[11px] uppercase tracking-[0.16em] text-graphite mb-1">
            {about.heading}
          </label>
          <form onSubmit={handleSubscribe} className="flex items-end border-b border-ink">
            <input
              id="footer-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (status === 'error' || status === 'done') { setStatus('idle'); setMessage(''); } }}
              placeholder="Enter your email"
              className="flex-1 min-w-0 bg-transparent py-2.5 outline-none placeholder:text-graphite/70"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="pl-4 py-2.5 text-[11px] uppercase tracking-[0.16em] hover:text-coral transition-colors disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending…' : 'Submit'}
            </button>
          </form>
          {message ? (
            <p className={`mt-3 text-[12px] ${status === 'error' ? 'text-coral' : 'text-ink'}`}>{message}</p>
          ) : (
            <p className="mt-3 text-[11px] leading-relaxed text-graphite">
              {about.text}{' '}
              By signing up you agree to our{' '}
              <Link to="/support/privacy" className="underline underline-offset-2 hover:text-ink">Privacy Policy</Link>.
            </p>
          )}
        </div>

        {/* One row of links (two columns on a phone) */}
        <nav aria-label="Footer" className="lg:pt-5">
          <ul className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-6 lg:gap-x-5 2xl:gap-x-8 gap-y-3 lg:justify-end">
            {LINKS.map((l) => (
              <li key={l.to}><Link to={l.to} className={linkCls}>{l.label}</Link></li>
            ))}
            {SOCIAL.map((s) => (
              <li key={s.label}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className={linkCls}>{s.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* The small print, and in the middle the sun — SUNDAY's coral circle
          on cream — which takes you home. Clear of the chat button on the right. */}
      <div className="mt-6 flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <p className="order-2 sm:order-none text-[12px] text-graphite">© {new Date().getFullYear()} SUNDAY · Dhaka, Bangladesh</p>
        <Link
          to="/"
          aria-label="SUNDAY home"
          className="order-1 sm:order-none self-center group w-9 h-9 rounded-full bg-[#FFEED6] ring-1 ring-black/10 flex items-center justify-center transition-transform hover:scale-110"
        >
          <span aria-hidden="true" className="w-4 h-4 rounded-full bg-[#FF7254]" />
        </Link>
        <span aria-hidden="true" />
      </div>
    </footer>
  );
}
