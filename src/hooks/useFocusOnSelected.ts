import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { MapLayout } from '../lib/map-layout';

const FOCUS_ZOOM = 1;
const FOCUS_DURATION_MS = 300;
const DEFAULT_CARD_HEIGHT = 96;

interface FocusInput {
  focusNonce: number;
  selectedId: string | null;
  layout: MapLayout;
  heights: Record<string, number>;
}

/** Quando o pedido de foco muda (clique na faixa de atenção), leva o mapa até o card selecionado. */
export function useFocusOnSelected({ focusNonce, selectedId, layout, heights }: FocusInput) {
  const { setCenter, getZoom } = useReactFlow();
  const handledFocus = useRef(focusNonce);
  useEffect(() => {
    if (focusNonce === handledFocus.current || !selectedId) return;
    const target = layout.placed[selectedId];
    if (!target) return;
    handledFocus.current = focusNonce;
    void setCenter(target.x + target.width / 2, target.y + (heights[selectedId] ?? DEFAULT_CARD_HEIGHT) / 2, { zoom: Math.min(getZoom(), FOCUS_ZOOM), duration: FOCUS_DURATION_MS });
  }, [focusNonce, selectedId, layout, heights, setCenter, getZoom]);
}
