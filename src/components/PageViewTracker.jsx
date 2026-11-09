import { useEffect } from 'react';
import { metaTrack } from '@/lib/metaPixel';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '@/lib/analytics';

// One page_views row per page shown, for Admin → Analytics. Admin pages are
// skipped inside trackPageView.
export default function PageViewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageView(pathname);
    // Meta Pixel too (it skips the admin's pages itself).
    metaTrack('PageView');
  }, [pathname]);
  return null;
}
