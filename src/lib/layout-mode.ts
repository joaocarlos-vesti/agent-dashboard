export type MapOrientation = 'horizontal' | 'vertical';
export type PanelMode = 'fixed' | 'overlay';
export interface LayoutMode { orientation: MapOrientation; panel: PanelMode }

const FIXED_PANEL_MIN_WIDTH = 1280;
const HORIZONTAL_MAP_MIN_WIDTH = 1100;

/** Mapa em colunas e painel fixo só onde cabem; abaixo disso, painel por cima, e árvore vertical em tela estreita. */
export const layoutModeFor = (width: number): LayoutMode => ({
  orientation: width >= HORIZONTAL_MAP_MIN_WIDTH ? 'horizontal' : 'vertical',
  panel: width >= FIXED_PANEL_MIN_WIDTH ? 'fixed' : 'overlay',
});
