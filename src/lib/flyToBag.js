// The add-to-bag flourish: a small copy of the product photo lifts off where
// it was tapped and arcs into the bag icon in the header, which then gives a
// little bounce (Header listens for 'sunday:bag-landed'). Resolves when it
// lands, so the bag drawer opens after it — or at once when motion is off
// or there's nothing to fly.
export function flyToBag(source, imageUrl) {
  const bag = document.querySelector('[data-bag-icon]');
  const from = source?.getBoundingClientRect?.();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!bag || !from || !imageUrl || reduce || !from.width) {
    window.dispatchEvent(new Event('sunday:bag-landed'));
    return Promise.resolve();
  }

  const to = bag.getBoundingClientRect();
  const size = Math.min(from.width, from.height, 160);
  const startX = from.left + from.width / 2 - size / 2;
  const startY = from.top + from.height / 2 - size / 2;
  const dx = to.left + to.width / 2 - (startX + size / 2);
  const dy = to.top + to.height / 2 - (startY + size / 2);

  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = '';
  Object.assign(img.style, {
    position: 'fixed', left: `${startX}px`, top: `${startY}px`, width: `${size}px`, height: `${size}px`,
    objectFit: 'cover', zIndex: 200, pointerEvents: 'none', borderRadius: '2px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
  });
  document.body.appendChild(img);

  // An arc: up a little first, then down into the bag, shrinking as it goes.
  const anim = img.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1, borderRadius: '2px' },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 80}px) scale(0.55)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0.4, borderRadius: '50%' },
    ],
    { duration: 750, easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'forwards' }
  );

  return anim.finished.catch(() => {}).then(() => {
    img.remove();
    window.dispatchEvent(new Event('sunday:bag-landed'));
  });
}
