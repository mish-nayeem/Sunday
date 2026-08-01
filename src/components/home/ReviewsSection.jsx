import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Star } from 'lucide-react';
import SectionHeader from '@/components/ui/SectionHeader';

export default function ReviewsSection() {
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    supabase.from('reviews').select('*').eq('is_approved', true)
      .order('created_at', { ascending: false }).limit(6)
      .then(({ data }) => setReviews(data || []));
  }, []);

  if (reviews.length === 0) return null;

  return (
    <section className="py-20 md:py-32 px-5 md:px-10">
      <div className="max-w-[1440px] mx-auto">
        <SectionHeader label="Customer Love" title="What They Say" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {reviews.map(r => (
            <div key={r.id} className="bg-mist p-6">
              <div className="flex mb-3">
                {[1,2,3,4,5].map(n => <Star key={n} size={12} className={n <= r.rating ? 'text-gold fill-gold' : 'text-charcoal/20'} />)}
              </div>
              <p className="text-sm text-charcoal/70 mb-4">{r.comment}</p>
              <p className="text-xs font-medium">{r.author_name}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
