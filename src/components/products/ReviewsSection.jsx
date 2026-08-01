import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Star } from 'lucide-react';

export default function ReviewsSection({ product }) {
  const [reviews, setReviews] = useState([]);
  const [form, setForm] = useState({ author_name: '', rating: 5, comment: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    supabase.from('reviews').select('*')
      .eq('product_id', product.id).eq('is_approved', true)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setReviews(data || []));
  }, [product.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await supabase.from('reviews').insert({
      product_id: product.id,
      product_name: product.name,
      author_name: form.author_name,
      rating: form.rating,
      comment: form.comment,
      is_approved: false,
    });
    setSubmitting(false);
    setSubmitted(true);
    setForm({ author_name: '', rating: 5, comment: '' });
  };

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  return (
    <div className="border-t border-sand/30 pt-16">
      <div className="flex items-center gap-3 mb-8">
        <h2 className="text-2xl font-light tracking-wide">Reviews</h2>
        {avgRating && (
          <span className="text-sm text-obsidian/50 font-mono">{avgRating} ★ ({reviews.length})</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="space-y-6">
          {reviews.length === 0 ? (
            <p className="text-sm text-obsidian/40">No reviews yet — be the first!</p>
          ) : (
            reviews.map(r => (
              <div key={r.id} className="border-b border-sand/10 pb-6">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium">{r.author_name}</p>
                  <div className="flex">{[1,2,3,4,5].map(n => <Star key={n} size={11} className={n <= r.rating ? 'text-gold fill-gold' : 'text-charcoal/20'} />)}</div>
                </div>
                <p className="text-sm text-obsidian/60">{r.comment}</p>
              </div>
            ))
          )}
        </div>

        <div>
          {submitted ? (
            <p className="text-sm text-green-600">Thanks! Your review will appear after approval.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[11px] tracking-[0.15em] uppercase font-medium block mb-2">Your Name</label>
                <input
                  type="text" required value={form.author_name}
                  onChange={e => setForm({ ...form, author_name: e.target.value })}
                  className="w-full border border-charcoal/20 px-3 py-2 text-sm bg-transparent outline-none focus:border-charcoal"
                />
              </div>
              <div>
                <label className="text-[11px] tracking-[0.15em] uppercase font-medium block mb-2">Rating</label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button type="button" key={n} onClick={() => setForm({ ...form, rating: n })}>
                      <Star size={20} className={n <= form.rating ? 'text-gold fill-gold' : 'text-charcoal/20'} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] tracking-[0.15em] uppercase font-medium block mb-2">Comment</label>
                <textarea
                  required rows={3} value={form.comment}
                  onChange={e => setForm({ ...form, comment: e.target.value })}
                  className="w-full border border-charcoal/20 px-3 py-2 text-sm bg-transparent outline-none focus:border-charcoal resize-none"
                />
              </div>
              <button type="submit" disabled={submitting} className="bg-wine text-white text-[11px] tracking-[0.15em] uppercase px-6 py-3 hover:bg-wine/90 disabled:opacity-50">
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
