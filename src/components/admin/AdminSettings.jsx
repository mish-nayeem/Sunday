import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Save } from 'lucide-react';

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('settings').select('*').order('created_at', { ascending: false }).limit(1);
      if (data && data.length > 0) setSettings(data[0]);
      else setSettings({ store_name: 'SUNDAY', store_email: '', store_phone: '', store_address: '', dhaka_delivery_charge: 60, outside_dhaka_delivery_charge: 120, facebook_url: 'https://facebook.com', instagram_url: 'https://instagram.com', whatsapp_number: '8801700000000' });
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    if (settings.id) {
      await supabase.from('settings').update(settings).eq('id', settings.id);
    } else {
      const { data: created } = await supabase.from('settings').insert(settings).select().single();
      if (created) setSettings(created);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading || !settings) {
    return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" /></div>;
  }

  const fields = [
    { key: 'store_name', label: 'Store Name', type: 'text' },
    { key: 'store_email', label: 'Store Email', type: 'email' },
    { key: 'store_phone', label: 'Store Phone', type: 'tel' },
    { key: 'store_address', label: 'Store Address', type: 'textarea' },
    { key: 'dhaka_delivery_charge', label: 'Dhaka Delivery Charge (৳)', type: 'number' },
    { key: 'outside_dhaka_delivery_charge', label: 'Outside Dhaka Charge (৳)', type: 'number' },
    { key: 'facebook_url', label: 'Facebook URL', type: 'text' },
    { key: 'instagram_url', label: 'Instagram URL', type: 'text' },
    { key: 'whatsapp_number', label: 'WhatsApp Number', type: 'text' },
  ];

  return (
    <div className="max-w-2xl">
      <div className="bg-white border border-gold/20 p-6 md:p-8">
        <h3 className="text-[11px] tracking-[0.2em] uppercase font-medium mb-6">Store Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
              <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-1">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea value={settings[f.key] || ''} onChange={e => setSettings({ ...settings, [f.key]: e.target.value })} rows={2} className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine resize-none" />
              ) : (
                <input type={f.type} value={settings[f.key] || ''} onChange={e => setSettings({ ...settings, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-4">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-wine text-white text-[11px] tracking-wider uppercase px-6 py-2 hover:bg-wine/90 transition-colors disabled:opacity-50">
            <Save size={14} /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && <span className="text-xs text-green-600">Settings saved successfully</span>}
        </div>
      </div>
    </div>
  );
}
