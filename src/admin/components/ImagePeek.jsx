import { useEffect } from 'react'
import { imgUrl } from '../lib/images.js'
import './image-peek.css'

// A product photo shown big, over everything — from a small thumbnail in the
// admin (an order's pieces), just to see which product it is. Tap anywhere,
// ✕ or Esc closes it.
export default function ImagePeek({ peek, onClose }) {
  useEffect(() => {
    if (!peek) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [peek, onClose])

  if (!peek) return null
  return (
    <div className="ipeek" role="dialog" aria-modal="true" aria-label={peek.title || 'Product photo'} onClick={onClose}>
      <button type="button" className="ipeek-x" aria-label="Close" onClick={onClose}>✕</button>
      <img src={imgUrl(peek.src, { w: 900 })} alt={peek.title || ''} />
      {peek.title && <div className="ipeek-title mono">{peek.title}</div>}
    </div>
  )
}
