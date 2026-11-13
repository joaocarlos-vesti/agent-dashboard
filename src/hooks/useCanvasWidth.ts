import { useEffect, useRef, useState } from 'react';

const MIN_WIDTH = 240;
const SIDE_PADDING = 32;
const INITIAL_WIDTH = 360;

/** Largura útil do elemento (sem as margens), acompanhando o redimensionamento. */
export function useCanvasWidth() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(INITIAL_WIDTH);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const follow = () => setAvailableWidth(Math.max(MIN_WIDTH, canvas.clientWidth - SIDE_PADDING));
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  return { canvasRef, availableWidth };
}
