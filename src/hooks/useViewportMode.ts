import { useEffect, useState } from 'react';
import { layoutModeFor, type LayoutMode } from '../lib/layout-mode';

export function useViewportMode(): LayoutMode {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const follow = () => setWidth(window.innerWidth);
    window.addEventListener('resize', follow);
    return () => window.removeEventListener('resize', follow);
  }, []);
  return layoutModeFor(width);
}
