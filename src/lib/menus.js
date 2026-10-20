// The side menu (☰) as Admin → Side menu sets it: a SHOP tab and an EXPLORE
// tab. Rows live in nav_categories (menu 'shop' / 'drops'), each a label and
// a link. Until a tab has rows of its own it shows a sensible default.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SECTIONS, CATEGORY_LABELS, COLLECTIONS } from '@/lib/catalog';

export const dropLink = (name) => `/shop?drop=${encodeURIComponent(name)}`;

// Where a row goes. Rows saved before links existed: SHOP rows name a
// category key, EXPLORE rows a drop.
export function rowLink(row) {
  if (row.link) return row.link;
  if (row.menu === 'drops') return dropLink(row.label);
  const key = String(row.label || '').toLowerCase();
  const section = SECTIONS.find((s) => s.key === key);
  return section ? `/shop?category=${key}` : `/shop?type=${encodeURIComponent(key)}`;
}

function rowLabel(row) {
  if (row.link || row.menu === 'drops') return row.label;
  const key = String(row.label || '').toLowerCase();
  return CATEGORY_LABELS[key] || SECTIONS.find((s) => s.key === key)?.label || row.label;
}

export const DEFAULT_SHOP = [
  { key: 'all', label: 'All products', to: '/shop' },
  ...COLLECTIONS.map((c) => ({ key: c.key, label: c.label, to: `/shop?filter=${c.key}` })),
  ...SECTIONS.map((s) => ({ key: s.key, label: s.label, to: `/shop?category=${s.key}` })),
];

// Everything a menu row can point at, for the admin's "Goes to" list.
export function linkChoices(drops = []) {
  return [
    ['/shop', 'All products'],
    ...COLLECTIONS.map((c) => [`/shop?filter=${c.key}`, c.label]),
    ...SECTIONS.map((s) => [`/shop?category=${s.key}`, `${s.label} (all)`]),
    ...Object.entries(CATEGORY_LABELS).map(([k, l]) => [`/shop?type=${encodeURIComponent(k)}`, l]),
    ...drops.map((d) => [dropLink(d), `Drop · ${d}`]),
    ...drops.map((d) => [`/lookbook/${encodeURIComponent(d)}`, `Lookbook · ${d}`]),
    ['/about', 'About'],
    ['/support/size-guide', 'Size guide'],
    ['/order-tracking', 'Track an order'],
    ['/contact', 'Contact'],
  ];
}

let cached = null;

async function loadMenus() {
  if (cached) return cached;
  const [{ data: rows }, { data: drops }] = await Promise.all([
    supabase.from('nav_categories').select('*').eq('active', true).order('sort_order'),
    supabase.from('products').select('drop_name').not('drop_name', 'is', null),
  ]);
  const toItem = (r) => ({ key: `${r.menu}-${r.id}`, label: rowLabel(r), to: rowLink(r) });
  const shopRows = (rows || []).filter((r) => r.menu === 'shop');
  const exploreRows = (rows || []).filter((r) => r.menu === 'drops');

  cached = {
    shop: shopRows.length ? shopRows.map(toItem) : DEFAULT_SHOP,
    explore: exploreRows.length
      ? exploreRows.map(toItem)
      : [...new Set((drops || []).map((d) => d.drop_name).filter(Boolean))].sort()
        .map((name) => ({ key: name, label: name, to: dropLink(name) })),
  };
  return cached;
}

const FALLBACK = { shop: DEFAULT_SHOP, explore: [] };

export function useMenus() {
  const [menus, setMenus] = useState(cached || FALLBACK);
  useEffect(() => {
    let alive = true;
    loadMenus().then((m) => alive && setMenus(m)).catch(() => {});
    return () => { alive = false; };
  }, []);
  return menus;
}
