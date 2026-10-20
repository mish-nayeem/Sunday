import { supabase } from './supabaseClient.js'

// Drop sections on the homepage (table home_features) — Admin → Homepage.

export async function fetchFeatures({ all = false } = {}) {
  let q = supabase.from('home_features').select('*').order('sort_order', { ascending: true }).order('id')
  if (!all) q = q.eq('active', true)
  const { data, error } = await q
  if (error) {
    console.error('[Supabase] fetchFeatures failed:', error.message)
    return { features: [], error }
  }
  return { features: data || [], error: null }
}

export async function createFeature(row) {
  const { data, error } = await supabase.from('home_features').insert(row).select('*').single()
  if (error) console.error('[Supabase] createFeature failed:', error.message)
  return { feature: data, error }
}

export async function updateFeature(id, patch) {
  const { error } = await supabase.from('home_features').update(patch).eq('id', id)
  if (error) console.error('[Supabase] updateFeature failed:', error.message)
  return { error }
}

export async function deleteFeature(id) {
  const { error } = await supabase.from('home_features').delete().eq('id', id)
  if (error) console.error('[Supabase] deleteFeature failed:', error.message)
  return { error }
}

// Writes every row's position, so a half-done swap can't leave two sections
// claiming the same place.
export async function reorderFeatures(list) {
  const results = await Promise.all(list.map((f, i) => supabase.from('home_features').update({ sort_order: i }).eq('id', f.id)))
  return { error: results.find((r) => r.error)?.error || null }
}

// Where a drop's Shop now goes.
export const dropShopLink = (drop) => `/shop?drop=${encodeURIComponent(drop)}`
