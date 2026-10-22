import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { makeMissingShareCopies } from '../lib/images.js'
import InfoTip from './InfoTip.jsx'

// Admin → Homepage → Link previews. Photos uploaded from now on get a small
// share copy by themselves; this makes the copies for photos uploaded
// before, so shared product and lookbook links show their photo on WhatsApp.
export default function SharePreviewsBox() {
  const [state, setState] = useState({ busy: false, done: 0, total: 0, result: null, error: '' })

  async function run() {
    setState({ busy: true, done: 0, total: 0, result: null, error: '' })
    try {
      const [products, looks, features, slides] = await Promise.all([
        supabase.from('products').select('images'),
        supabase.from('lookbook_looks').select('image_url'),
        supabase.from('home_features').select('image_url,mobile_image_url,pics'),
        supabase.from('hero_slides').select('image_url'),
      ])
      const urls = [
        ...(products.data || []).flatMap((p) => p.images || []),
        ...(looks.data || []).map((l) => l.image_url),
        ...(features.data || []).flatMap((f) => [f.image_url, f.mobile_image_url, ...(f.pics || []).map((p) => p?.url)]),
        ...(slides.data || []).map((s) => s.image_url),
      ]
      const result = await makeMissingShareCopies(urls, supabase, (done, total) => setState((s) => ({ ...s, done, total })))
      setState((s) => ({ ...s, busy: false, result }))
    } catch (err) {
      setState((s) => ({ ...s, busy: false, error: err.message || 'Something went wrong — try again.' }))
    }
  }

  const { busy, done, total, result, error } = state
  return (
    <section className="hm-box wide">
      <div className="hm-box-head">
        <span className="hm-box-title mono">LINK PREVIEWS · WHATSAPP & FACEBOOK</span>
        <InfoTip>
          <p>When a product or lookbook link is shared on WhatsApp, Facebook or Messenger, the preview shows that product’s or look’s own photo, name and price.</p>
          <p>WhatsApp skips large photos, so every photo you upload also gets a small copy for previews — automatically, from now on.</p>
          <p><b>Make previews for older photos</b> does the same for photos uploaded before this existed. Run it once; it skips photos that already have one. It can take a minute with many photos — keep this page open.</p>
          <p>WhatsApp remembers a link’s old preview for a while. To see a new one at once, share the link with <b>?v=2</b> added at the end.</p>
        </InfoTip>
      </div>
      <div className="hm-actions" style={{ marginTop: 0 }}>
        <button type="button" className="courier-btn mono" onClick={run} disabled={busy}>
          {busy ? `Working… ${done}/${total || '…'}` : 'Make previews for older photos'}
        </button>
        {result && (
          <span className="hm-note mono">
            Done — {result.made} made, {result.skipped} already had one{result.failed ? `, ${result.failed} couldn’t be made` : ''}.
          </span>
        )}
        {error && <span className="hm-note mono">{error}</span>}
      </div>
    </section>
  )
}
