// Product, hero and about-page photos live in Supabase Storage (the public
// `images` bucket — see supabase-migration-image-storage.sql). This file
// does the two things the rest of the app needs from it:
//
// imgUrl() — asks for roughly the size an <img> actually renders. A phone
//   photo is several MB; serving that into a 260px grid tile wastes nearly
//   all of it. Supabase's image transformation endpoint resizes on the fly,
//   serves WebP to browsers that take it, and caches the result on its CDN.
//
// uploadImage() — the admin panel's upload, straight from the browser into
//   the bucket. Only the signed-in admin can write there (storage policies
//   check public.is_admin()), so no signing step or secret is involved.
//
// Old Cloudinary links still work until the admin panel's "Move images to
// Supabase" button has copied them over; anything else (a placeholder URL,
// say) passes through untouched.

export const IMAGE_BUCKET = 'images'

const SUPABASE_OBJECT = '/storage/v1/object/public/'
const SUPABASE_RENDER = '/storage/v1/render/image/public/'
const CLOUDINARY_MARKER = '/image/upload/'

// Supabase's resizer is a paid-plan feature; on the free plan the render URL
// fails and the photo shows as broken. Same switch as the storefront
// (src/lib/storage.js): off unless VITE_SUPABASE_IMAGE_TRANSFORM=true, and
// then the stored file is served as it is.
const TRANSFORM = import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORM === 'true'

export function imgUrl(url, { w, h, q, original = false } = {}) {
  if (typeof url !== 'string') return url

  // The stored file itself, untouched — for the full-screen view, where a
  // second resize and re-encode would soften what was uploaded.
  if (original) return url

  if (url.includes(SUPABASE_OBJECT)) {
    if (!TRANSFORM) return url
    // A URL that already carries its own query was set up by hand — leave it.
    if (url.includes('?')) return url

    // 75 keeps grid tiles light; a full-screen view asks for more (q).
    const params = new URLSearchParams({ quality: String(q || 75) })
    if (w) params.set('width', String(w))
    if (h) params.set('height', String(h))
    // With both sides set, fill the box and crop the overflow — the same
    // thing object-fit: cover would do in the browser. With one side only,
    // `contain`: Supabase's default is `cover`, which with a width alone
    // keeps the photo's full height and cuts a narrow strip out of the
    // middle — the grid then blew that strip up, so every tile looked
    // zoomed in. `contain` just scales the whole photo down, the way
    // Cloudinary's c_limit did.
    params.set('resize', w && h ? 'cover' : 'contain')

    return url.replace(SUPABASE_OBJECT, SUPABASE_RENDER) + '?' + params
  }

  if (url.includes(CLOUDINARY_MARKER)) {
    const [base, rest] = url.split(CLOUDINARY_MARKER)
    // Already transformed in the DB — an explicit crop there should win.
    if (/^[a-z]{1,3}_[^/]+\//.test(rest)) return url

    const parts = ['f_auto', 'q_auto', 'c_limit']
    if (w) parts.push(`w_${w}`)
    if (h) parts.push(`h_${h}`)
    return `${base}${CLOUDINARY_MARKER}${parts.join(',')}/${rest}`
  }

  return url
}

// ---------- Upload ----------

// Photos are shrunk in the browser before they go up, to 1.5 MB at most a
// file: Supabase's free storage is small, and a camera original can be
// 20–50 MB and 8000 px wide. It starts at 3600 px on the long side at 92%
// and steps the quality, then the size, down only as far as it must to fit
// — most photos stay 3000 px or more, plenty for full-screen zoom. Photos
// that already fit go up untouched.
const MAX_BYTES = 1.5 * 1024 * 1024
const STEPS = [
  [3600, 0.92], [3600, 0.85], [3000, 0.85], [3000, 0.78],
  [2500, 0.8], [2200, 0.78], [2000, 0.75], [1600, 0.72],
]

async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file // a format this browser can't open — let the bucket judge it
  }

  const { width, height } = bitmap
  const longSide = Math.max(width, height)
  if (longSide <= STEPS[0][0] && file.size <= MAX_BYTES) {
    bitmap.close?.()
    return file
  }

  // PNGs may be see-through: WebP keeps that. Everything else becomes JPEG.
  const wanted = file.type === 'image/png' ? 'image/webp' : 'image/jpeg'
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let drawnSide = 0
  let blob = null

  for (const [side, quality] of STEPS) {
    const scale = Math.min(1, side / longSide)
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)
    if (w !== drawnSide) {
      canvas.width = w
      canvas.height = h
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, w, h)
      drawnSide = w
    }
    blob = await new Promise((resolve) => canvas.toBlob(resolve, wanted, quality))
    if (blob && blob.size <= MAX_BYTES) break
  }
  bitmap.close?.()

  if (!blob || blob.size >= file.size) return file

  const type = blob.type || wanted
  const ext = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg'
  const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext
  return new File([blob], name, { type })
}

// `folder` only keeps the bucket tidy (products/, hero/, about/). A random
// name means two photos called IMG_0001.jpg never overwrite each other.
// ---------- Share copies ----------

// Beside every photo the admin uploads sits a small copy, <name>.share.jpg
// (1200 px at most, under ~280 KB): link previews on WhatsApp skip large
// images, so the preview worker (worker/index.js) points them at this copy.
const SHARE_MAX_BYTES = 280 * 1024
const SHARE_STEPS = [[1200, 0.82], [1200, 0.72], [1000, 0.72], [800, 0.7], [640, 0.65]]

export const shareUrlFor = (url) => String(url).replace(/\.[a-z0-9]+(\?.*)?$/i, '.share.jpg')

async function shareCopy(blob) {
  if (typeof createImageBitmap !== 'function') return null
  let bitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null // a video, or a format the browser can't open
  }
  const longSide = Math.max(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let out = null
  for (const [side, quality] of SHARE_STEPS) {
    const scale = Math.min(1, side / longSide)
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    ctx.fillStyle = '#fff' // see-through PNGs get a white ground, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (out && out.size <= SHARE_MAX_BYTES) break
  }
  bitmap.close?.()
  return out
}

async function putShareCopy(supabase, path, blob) {
  const small = await shareCopy(blob)
  if (!small) return false
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path.replace(/\.[a-z0-9]+$/i, '.share.jpg'), small, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: true,
  })
  return !error
}

// For photos uploaded before share copies existed: makes the missing ones.
// `urls` are public URLs from the images bucket (others are skipped).
// Reports progress as (done, total). Returns { made, skipped, failed }.
export async function makeMissingShareCopies(urls, supabase, onProgress = () => {}) {
  const marker = `/storage/v1/object/public/${IMAGE_BUCKET}/`
  const list = [...new Set(urls.filter((u) => typeof u === 'string' && u.includes(marker) && !u.includes('.share.') && !/\.(mp4|webm|mov)(\?|$)/i.test(u)))]
  const result = { made: 0, skipped: 0, failed: 0 }
  for (let i = 0; i < list.length; i++) {
    const url = list[i].split('?')[0]
    try {
      const head = await fetch(shareUrlFor(url), { method: 'HEAD' })
      if (head.ok) result.skipped++
      else {
        const res = await fetch(url)
        const ok = res.ok && (await putShareCopy(supabase, decodeURIComponent(url.split(marker)[1]), await res.blob()))
        result[ok ? 'made' : 'failed']++
      }
    } catch {
      result.failed++
    }
    onProgress(i + 1, list.length)
  }
  return result
}

export async function uploadImage(original, supabase, folder = 'uploads') {
  const file = await shrink(original)
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    // A path is never reused, so browsers and the CDN can keep it for a year.
    cacheControl: '31536000',
    upsert: false,
  })

  if (error) throw new Error(error.message)

  // The small copy for link previews; a failure here never fails the upload.
  try { await putShareCopy(supabase, path, file) } catch { /* preview falls back to the photo */ }

  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}
