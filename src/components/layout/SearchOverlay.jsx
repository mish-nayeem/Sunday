import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { imgUrl } from '@/lib/storage';
import { SECTIONS, formatPrice } from '@/lib/catalog';

// Full-width search panel under the header. Results update as you type;
// Enter opens the full result list on the shop page.
export default function SearchOverlay({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('id,name,price,images,category')
        .ilike('name', `%${q}%`)
        .limit(8);
      setResults(data || []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/shop?search=${encodeURIComponent(query.trim())}`);
    onClose();
  };

  const q = query.trim();

  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="h-16 px-4 md:px-6 flex items-center gap-4 border-b border-rule">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shirts, polos, trousers"
            className="flex-1 min-w-0 bg-transparent outline-none font-heading text-[22px] md:text-[28px] placeholder:text-graphite/60"
          />
          <button type="button" onClick={onClose} aria-label="Close search" className="p-1">
            <X size={22} strokeWidth={1.5} />
          </button>
        </form>

        <div className="px-4 md:px-6 py-6">
          {q.length < 2 ? (
            <div>
              <p className="text-[12px] text-graphite mb-3">Browse</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {SECTIONS.map((s) => (
                  <Link key={s.key} to={`/shop?category=${s.key}`} onClick={onClose} className="text-[14px] hover:underline underline-offset-4">
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : searching && results.length === 0 ? (
            <p className="text-[13px] text-graphite">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-[13px] text-graphite">Nothing matches “{q}”. Try a product type like shirt or polo.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-3 gap-y-6">
                {results.map((p) => (
                  <Link key={p.id} to={`/product/${p.id}`} onClick={onClose} className="group">
                    <div className="aspect-[4/5] bg-stone mb-2 overflow-hidden">
                      {p.images?.[0] && (
                        <img src={imgUrl(p.images[0], 300)} alt="" loading="lazy" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <p className="text-[12px] leading-snug group-hover:underline underline-offset-2">{p.name}</p>
                    <p className="text-[12px] text-graphite">{formatPrice(p.price)}</p>
                  </Link>
                ))}
              </div>
              <button type="submit" onClick={submit} className="mt-6 text-[13px] underline underline-offset-4">
                See all results for “{q}”
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
