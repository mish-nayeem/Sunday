import React, { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

export default function WhatsAppButton() {
  const [number, setNumber] = useState('8801700000000');
  // On a product page the phone's sticky add-to-bag bar owns the bottom edge.
  const onProduct = useLocation().pathname.startsWith('/product/');

  useEffect(() => {
    supabase.from('settings').select('whatsapp_number').limit(1).then(({ data }) => {
      if (data && data[0]?.whatsapp_number) setNumber(data[0].whatsapp_number);
    });
  }, []);

  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank" rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={`fixed bottom-5 right-5 z-30 w-12 h-12 bg-ink text-white rounded-full items-center justify-center hover:bg-ink/85 ${onProduct ? 'hidden md:flex' : 'flex'}`}
    >
      <MessageCircle size={20} strokeWidth={1.5} />
    </a>
  );
}
