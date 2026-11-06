import React, { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';

export default function WhatsAppButton() {
  const [number, setNumber] = useState('8801700000000');
  // On a product page the phone's sticky add-to-bag bar owns the bottom edge.
  const { pathname } = useLocation();
  const onProduct = pathname.startsWith('/product/');

  useEffect(() => {
    supabase.from('settings').select('whatsapp_number').limit(1).then(({ data }) => {
      if (data && data[0]?.whatsapp_number) setNumber(data[0].whatsapp_number);
    });
  }, []);

  // Not on the homepage: the hero and drop banners stay clear.
  if (pathname === '/') return null;

  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank" rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      // Cream circle with an orange ring, the message icon drawn in the
      // same orange (the logo's coral).
      className={`fixed bottom-5 right-5 z-30 w-12 h-12 bg-[#F6F1E7] text-coral border-[1.5px] border-coral rounded-full items-center justify-center shadow-sm hover:bg-[#EFE7D8] transition-colors ${onProduct ? 'hidden md:flex' : 'flex'}`}
    >
      <MessageCircle size={20} strokeWidth={1.5} />
    </a>
  );
}
