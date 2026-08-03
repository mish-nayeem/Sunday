import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Send } from 'lucide-react';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from('contact_messages').insert(form);
    setSubmitting(false);
    if (!error) {
      setSent(true);
      setForm({ name: '', email: '', subject: '', message: '' });
    }
  };

  return (
    <div className="min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[11px] tracking-[0.3em] uppercase text-sand mb-3">Get In Touch</p>
          <h1 className="text-3xl md:text-4xl font-light tracking-wide">Contact Us</h1>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-5 md:px-10 py-10 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-16">
          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <Phone size={20} strokeWidth={1} className="text-sand mt-1" />
              <div>
                <p className="text-[11px] tracking-[0.15em] uppercase font-medium mb-1">Phone</p>
                <p className="text-sm text-charcoal/60">+880 1700-000000</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <Mail size={20} strokeWidth={1} className="text-sand mt-1" />
              <div>
                <p className="text-[11px] tracking-[0.15em] uppercase font-medium mb-1">Email</p>
                <p className="text-sm text-charcoal/60">hello@sunday.com.bd</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <MapPin size={20} strokeWidth={1} className="text-sand mt-1" />
              <div>
                <p className="text-[11px] tracking-[0.15em] uppercase font-medium mb-1">Address</p>
                <p className="text-sm text-charcoal/60">Dhaka, Bangladesh</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {sent ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-ivory p-8 text-center">
                <p className="text-lg font-medium mb-2">Message Sent</p>
                <p className="text-sm text-charcoal/60">Thanks for reaching out — we'll get back to you soon.</p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Name *</label>
                    <input
                      type="text" required value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Email *</label>
                    <input
                      type="email" required value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Subject</label>
                  <input
                    type="text" value={form.subject}
                    onChange={e => setForm({ ...form, subject: e.target.value })}
                    className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[11px] tracking-[0.2em] uppercase font-medium block mb-2">Message *</label>
                  <textarea
                    required rows={5} value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    className="w-full border border-charcoal/20 px-4 py-3 text-sm bg-transparent outline-none focus:border-charcoal transition-colors resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 bg-wine text-white text-[11px] tracking-[0.2em] uppercase px-8 py-4 hover:bg-wine/90 transition-colors disabled:opacity-50"
                >
                  <Send size={14} /> {submitting ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}