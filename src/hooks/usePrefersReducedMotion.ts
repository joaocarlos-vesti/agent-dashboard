import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const follow = () => setReduced(media.matches);
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);
  return reduced;
}
