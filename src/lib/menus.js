// The header's menus as the admin panel's Nav menus set them. SHOP rows name
// a product category (SUNDAY's category keys); DROPS rows name a drop. Until
// a menu has rows of its own it falls back to what the catalog contains.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SECTIONS, CATEGORY_LABELS } from '@/lib/catalog';

let cached = null;

async function loadMenus() {
  if (cached) return cached;
  const [{ data: rows }, { data: drops }] = await Promise.all([
    supabase.from('nav_categories').select('label, menu, sort_order').order('sort_order'),
    supabase.from('products').select('drop_name').not('drop_name', 'is', null),
  ]);
  const shopRows = (rows || []).filter((r) => r.menu === 'shop');
  const dropRows = (rows || []).filter((r) => r.menu === 'drops');

  cached = {
    // Admin's list → one link per category; otherwise SUNDAY's four sections.
    shop: shopRows.length
      ? shopRows.map((r) => ({ key: r.label, label: CATEGORY_LABELS[r.label] || r.label, to: `/shop?type=${encodeURIComponent(r.label)}` }))
      : SECTIONS.map((s) => ({ key: s.key, label: s.label, to: `/shop?category=${s.key}` })),
    drops: (dropRows.length
      ? dropRows.map((r) => r.label)
      : [...new Set((drops || []).map((d) => d.drop_name).filter(Boolean))].sort()
    ).map((name) => ({ key: name, label: name, to: `/shop?drop=${encodeURIComponent(name)}` })),
  };
  return cached;
}

const FALLBACK = {
  shop: SECTIONS.map((s) => ({ key: s.key, label: s.label, to: `/shop?category=${s.key}` })),
  drops: [],
};

export function useMenus() {
  const [menus, setMenus] = useState(cached || FALLBACK);
  useEffect(() => {
    let alive = true;
    loadMenus().then((m) => alive && setMenus(m)).catch(() => {});
    return () => { alive = false; };
  }, []);
  return menus;
}
