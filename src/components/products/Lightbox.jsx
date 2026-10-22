import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { imgUrl } from '@/lib/storage';

const ZOOM = 2.5;

// A product's photos full screen. Tap or click a photo to zoom in; with a
// mouse the zoomed photo follows the pointer, on a phone drag it around (or
// pinch). Arrows, swipes and the keyboard (← → Esc) move between photos.
export default function Lightbox({ images, start = 0, alt = '', onClose }) {
  const [at, setAt] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const box = useRef(null);
  const touch = useRef(null);
  const count = images.length;

  const go = (dir) => {
    setZoomed(false);
    setAt((n) => (n + dir + count) % count);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && count > 1) go(1);
      if (e.key === 'ArrowLeft' && count > 1) go(-1);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom in on the spot that was tapped.
  const toggleZoom = (e) => {
    const el = box.current;
    if (zoomed) return setZoomed(false);
    const r = el.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    setZoomed(true);
    requestAnimationFrame(() => {
      el.scrollLeft = fx * (el.scrollWidth - el.clientWidth);
      el.scrollTop = fy * (el.scrollHeight - el.clientHeight);
    });
  };

  // With a mouse, a zoomed photo pans to follow the pointer.
  const onMove = (e) => {
    if (!zoomed || e.pointerType !== 'mouse') return;
    const el = box.current;
    const r = el.getBoundingClientRect();
    el.scrollLeft = ((e.clientX - r.left) / r.width) * (el.scrollWidth - el.clientWidth);
    el.scrollTop = ((e.clientY - r.top) / r.height) * (el.scrollHeight - el.clientHeight);
  };

  const onTouchStart = (e) => { touch.current = e.touches.length === 1 ? e.touches[0].clientX : null; };
  const onTouchEnd = (e) => {
    if (zoomed || touch.current == null || count < 2) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-white flex flex-col" role="dialog" aria-modal="true" aria-label={`${alt} photos`}>
      <div className="h-14 px-4 md:px-6 flex items-center justify-between shrink-0 text-[12px]">
        <span className="tabular-nums text-graphite">{at + 1} / {count}</span>
        <span className="hidden md:inline text-graphite">{zoomed ? 'Click to zoom out' : 'Click to zoom in'}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1"><X size={22} strokeWidth={1.25} /></button>
      </div>

      <div
        ref={box}
        className={`relative flex-1 overflow-auto hide-scrollbar ${zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
        onClick={toggleZoom}
        onPointerMove={onMove}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: zoomed ? 'pan-x pan-y pinch-zoom' : 'pinch-zoom' }}
      >
        <img
          key={images[at]}
          src={imgUrl(images[at], 2400)}
          alt={`${alt}, photo ${at + 1}`}
          draggable={false}
          className="select-none mx-auto block page-in"
          style={zoomed
            ? { width: `${ZOOM * 100}%`, maxWidth: 'none', height: 'auto' }
            : { width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>

      {count > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full">
            <ChevronLeft size={24} strokeWidth={1.25} />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 rounded-full">
            <ChevronRight size={24} strokeWidth={1.25} />
          </button>
          <div className="h-20 shrink-0 flex items-center justify-center gap-2 px-4 overflow-x-auto hide-scrollbar">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => { setZoomed(false); setAt(i); }}
                aria-label={`Photo ${i + 1}`}
                aria-current={i === at ? 'true' : undefined}
                className={`shrink-0 w-11 h-14 bg-stone overflow-hidden border ${i === at ? 'border-ink' : 'border-transparent opacity-60 hover:opacity-100'}`}
              >
                <img src={imgUrl(src, 120)} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
