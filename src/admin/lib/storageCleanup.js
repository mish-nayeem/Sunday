import { supabase } from './supabaseClient.js'
import { IMAGE_BUCKET } from './images.js'

// Photos nothing uses any more — the database finds them
// (admin_storage_unused(), migration 20261109170000_storage_cleanup.sql) and
// these remove them from Supabase Storage, link-preview copies included.

const MARKER = `/storage/v1/object/public/${IMAGE_BUCKET}/`

export const publicUrl = (name) => supabase.storage.from(IMAGE_BUCKET).getPublicUrl(name).data.publicUrl

// Every Storage file a row (or any value) points at, by object name.
export function filesIn(value) {
  const names = new Set()
  const text = JSON.stringify(value ?? null)
  const re = /\/storage\/v1\/(?:object|render\/image)\/public\/images\/([^"?#\s\\]+)/g
  let m
  while ((m = re.exec(text))) {
    let name
    try { name = decodeURIComponent(m[1]) } catch { name = m[1] }
    names.add(name)
    // The small copy beside it (images.js → putShareCopy).
    if (!/\.share\.jpg$/i.test(name)) names.add(name.replace(/\.[a-z0-9]+$/i, '.share.jpg'))
  }
  return [...names]
}

// Whole bucket, files older than a day that nothing points at.
export async function fetchUnused() {
  const { data, error } = await supabase.rpc('admin_storage_unused')
  if (error) return { files: [], error: /admin_storage_unused/.test(error.message || '') ? 'missing' : 'failed' }
  return { files: (data || []).map((f) => ({ ...f, url: publicUrl(f.name) })), error: null }
}

export async function deleteFiles(names) {
  let removed = 0
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100)
    const { data, error } = await supabase.storage.from(IMAGE_BUCKET).remove(chunk)
    if (error) return { removed, error }
    removed += (data || chunk).length
  }
  return { removed, error: null }
}

// After a product, slide or look is deleted: its photos go too, unless
// something else still uses them. Never fails the delete it follows.
export async function removeIfUnused(names) {
  if (!names?.length) return
  try {
    const { data, error } = await supabase.rpc('admin_storage_unused', { p_names: names, p_min_age: '0' })
    if (error || !data?.length) return
    await deleteFiles(data.map((f) => f.name))
  } catch (e) {
    console.warn('[Storage] cleanup skipped:', e?.message)
  }
}

// Reads the rows first (their photo links), runs the delete, then cleans up.
export async function deleteWithPhotos(table, column, values, run) {
  const { data } = await supabase.from(table).select('*').in(column, values)
  const result = await run()
  if (!result?.error) await removeIfUnused(filesIn(data))
  return result
}
