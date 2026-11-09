import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Cloudflare Turnstile — the "not a robot" check on login, checkout and the
// support portal. Set up in Admin → Orders → Security → Bot check
// (site_settings 'turnstile' = { site_key, enforce }). With no site key,
// nothing loads and every form works as before.
//
// Usually invisible: Cloudflare checks the browser in the background and
// only shows a tick box when it isn't sure. Its token goes to the
// turnstile-check edge function, which gives back a pass for the database
// (checkout, support), or — on login — straight to Supabase Auth.

let config = null;
export function botCheckConfig() {
  if (!config) {
    config = supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'turnstile')
      .maybeSingle()
      .then(({ data }) => ({ siteKey: String(data?.value?.site_key || '').trim(), enforce: Boolean(data?.value?.enforce) }))
      .catch(() => ({ siteKey: '', enforce: false }));
  }
  return config;
}

let script = null;
function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!script) {
    script = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => { script = null; reject(new Error('Turnstile did not load')); };
      document.head.appendChild(s);
    });
  }
  return script;
}

// The check for one form. Put <div ref={bot.box} /> where the tick box may
// appear; `bot.token` is the current token, `bot.getPass()` swaps it for a
// database pass (kept and reused for a few minutes), `bot.reset()` asks for
// a new token after one has been used.
export function useBotCheck(action) {
  const [cfg, setCfg] = useState(null);
  const [token, setToken] = useState('');
  const box = useRef(null);
  const widget = useRef(null);
  const pass = useRef(null);

  useEffect(() => { let live = true; botCheckConfig().then((c) => live && setCfg(c)); return () => { live = false; }; }, []);

  useEffect(() => {
    if (!cfg?.siteKey || !box.current) return undefined;
    let gone = false;
    loadTurnstile()
      .then((t) => {
        if (gone || !box.current || widget.current != null) return;
        widget.current = t.render(box.current, {
          sitekey: cfg.siteKey,
          action,
          appearance: 'interaction-only',
          callback: (tk) => setToken(tk),
          'expired-callback': () => setToken(''),
          'error-callback': () => setToken(''),
        });
      })
      .catch(() => {});
    return () => {
      gone = true;
      try { if (widget.current != null) window.turnstile?.remove(widget.current); } catch { /* gone already */ }
      widget.current = null;
    };
  }, [cfg?.siteKey, action]);

  function reset() {
    setToken('');
    try { if (widget.current != null) window.turnstile?.reset(widget.current); } catch { /* not there */ }
  }

  async function getPass() {
    const p = pass.current;
    if (p && Date.now() - p.at < 8 * 60e3 && p.uses < 8) {
      p.uses += 1;
      return p.id;
    }
    if (!token) return null;
    const { data } = await supabase.functions.invoke('turnstile-check', { body: { token } }).catch(() => ({ data: null }));
    reset();
    if (!data?.pass) return null;
    pass.current = { id: data.pass, at: Date.now(), uses: 1 };
    return data.pass;
  }

  return { on: Boolean(cfg?.siteKey), enforce: Boolean(cfg?.enforce), token, box, reset, getPass };
}

export const BOT_CHECK_MESSAGE = 'We couldn’t confirm you’re not a robot. Wait a moment (or tick the box if one shows) and try again.';
