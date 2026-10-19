import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { isAdminEmail } from '@/lib/adminEmail';
import logo from '@/assets/logo.png';

const RESEND_AFTER = 60; // seconds

// One page for logging in and for opening an account: no passwords. Enter an
// email, get a one-time code by email, type it in. A new address gets an
// account on the spot. The shop's own address goes to the admin panel;
// everyone else is a customer.
export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const [step, setStep] = useState('email'); // email | code
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const codeRef = useRef(null);

  // Where to go once signed in: admin → the panel; otherwise back to where
  // they came from (?next=/checkout), or home. ?next is only followed to a
  // path on this site.
  const destination = (address) => {
    if (isAdminEmail(address)) return '/admin';
    const next = params.get('next') || '/';
    return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/admin') ? next : '/';
  };

  useEffect(() => {
    if (isAuthenticated && user?.email) navigate(destination(user.email), { replace: true });
  }, [isAuthenticated, user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const sendCode = async (e) => {
    e?.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) {
      setError(
        err.status === 429 || /rate|seconds/i.test(err.message)
          ? 'Too many codes asked for. Wait a minute and try again.'
          : 'We couldn’t send a code to that address. Check it and try again.'
      );
      return;
    }
    setEmail(address);
    setCode('');
    setStep('code');
    setWait(RESEND_AFTER);
  };

  const verify = async (e) => {
    e.preventDefault();
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return setError('Enter the code from the email.');
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (err) {
      setBusy(false);
      setError(/expired/i.test(err.message) ? 'That code has expired. Send a new one.' : 'That code isn’t right. Check the email and try again.');
      return;
    }
    // The auth listener picks the new session up; go straight on from here.
    navigate(destination(data.user?.email || email), { replace: true });
  };

  const field = 'w-full border border-rule px-3 h-12 text-[15px] bg-white outline-none focus:border-ink';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-white">
      <div className="w-full max-w-sm">
        <Link to="/" className="block w-fit mx-auto mb-10" aria-label="SUNDAY home">
          <img src={logo} alt="SUNDAY" className="h-7 w-auto" />
        </Link>

        {step === 'email' ? (
          <form onSubmit={sendCode}>
            <h1 className="font-heading text-[30px] leading-tight text-center">Log in or create an account</h1>
            <p className="mt-2 text-[14px] text-graphite text-center">We’ll email you a one-time code. No password needed.</p>
            <label htmlFor="email" className="block text-[13px] mt-8 mb-1.5">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={field}
            />
            {error && <p className="mt-3 text-[13px] text-coral" role="alert">{error}</p>}
            <button type="submit" disabled={busy} className="mt-5 w-full h-12 bg-ink text-white text-[13px] disabled:opacity-50">
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <h1 className="font-heading text-[30px] leading-tight text-center">Check your email</h1>
            <p className="mt-2 text-[14px] text-graphite text-center">
              We sent a code to <span className="text-ink">{email}</span>.
            </p>
            <label htmlFor="code" className="block text-[13px] mt-8 mb-1.5">Code</label>
            <input
              id="code"
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className={`${field} tracking-[0.3em] tabular-nums`}
            />
            {error && <p className="mt-3 text-[13px] text-coral" role="alert">{error}</p>}
            <button type="submit" disabled={busy} className="mt-5 w-full h-12 bg-ink text-white text-[13px] disabled:opacity-50">
              {busy ? 'Checking…' : 'Log in'}
            </button>
            <div className="mt-5 flex justify-between text-[13px]">
              <button type="button" onClick={() => { setStep('email'); setError(''); }} className="underline underline-offset-4">
                Use another email
              </button>
              <button type="button" onClick={sendCode} disabled={wait > 0 || busy} className="underline underline-offset-4 disabled:no-underline disabled:text-graphite">
                {wait > 0 ? `Send again in ${wait}s` : 'Send a new code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
