import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Star } from 'lucide-react';

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(200);
      setReviews(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const toggleApproval = async (review) => {
    await supabase.from('reviews').update({ is_approved: !review.is_approved }).eq('id', review.id);
    setReviews(prev => prev.map(r => r.id === review.id ? { ...r, is_approved: !r.is_approved } : r));
  };

  const deleteReview = async (review) => {
    await supabase.from('reviews').delete().eq('id', review.id);
    setReviews(prev => prev.filter(r => r.id !== review.id));
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" /></div>;
  }

  const filtered = filter === 'all' ? reviews : filter === 'approved' ? reviews.filter(r => r.is_approved) : reviews.filter(r => !r.is_approved);
  const pendingCount = reviews.filter(r => !r.is_approved).length;

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {[
          { key: 'pending', label: `Pending (${pendingCount})` },
          { key: 'approved', label: 'Approved' },
          { key: 'all', label: `All (${reviews.length})` }
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`text-[11px] tracking-wider uppercase px-4 py-2 transition-colors ${filter === f.key ? 'bg-wine text-white' : 'bg-white border border-gold/20 text-charcoal/50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-charcoal/40 py-20">No reviews</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(review => (
            <div key={review.id} className="bg-white border border-gold/20 p-5 flex flex-col md:flex-row md:items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-sm font-medium">{review.author_name}</p>
                  <div className="flex">{[1,2,3,4,5].map(n => <Star key={n} size={12} className={n <= review.rating ? 'text-gold fill-gold' : 'text-charcoal/20'} />)}</div>
                  {!review.is_approved && <span className="text-[10px] tracking-wider uppercase text-wine bg-wine/10 px-2 py-0.5">Pending</span>}
                </div>
                <p className="text-xs text-charcoal/40 mb-2">on {review.product_name}</p>
                <p className="text-sm text-charcoal/60">{review.comment}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleApproval(review)} className={`text-[10px] tracking-wider uppercase px-3 py-2 transition-colors ${review.is_approved ? 'border border-charcoal/20 text-charcoal/60 hover:bg-ivory' : 'bg-wine text-white hover:bg-wine/90'}`}>
                  {review.is_approved ? 'Unapprove' : 'Approve'}
                </button>
                <button onClick={() => deleteReview(review)} className="text-[10px] tracking-wider uppercase px-3 py-2 border border-red-200 text-red-500 hover:bg-red-50 transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
