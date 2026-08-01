import React, { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export default function WhatsAppButton() {
  const [number, setNumber] = useState('8801700000000');

  useEffect(() => {
    supabase.from('settings').select('whatsapp_number').limit(1).then(({ data }) => {
      if (data && data[0]?.whatsapp_number) setNumber(data[0].whatsapp_number);
    });
  }, []);

  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank" rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-30 w-14 h-14 bg-green-500 rounded-full flex items-center justify-center shadow-lg hover:bg-green-600 transition-colors"
    >
      <MessageCircle size={26} className="text-white" fill="white" />
    </a>
  );
}
