import { lineState } from './activity';
import type { MapOrientation } from './layout-mode';
import type { VisibleItem } from './map-tree';

export type EdgeLine = 'flow' | 'dashed' | 'idle' | 'dotted' | 'ended' | 'more';

export interface PlacedItem { id: string; x: number; y: number; width: number }
export interface PlacedEdge { id: string; sourceId: string; targetId: string; path: string; line: EdgeLine }
export interface MapLayout { placed: Record<string, PlacedItem>; edges: PlacedEdge[]; width: number; height: number }

export interface LayoutInput {
  items: VisibleItem[];
  heights: Record<string, number>;
  edgeLines: Record<string, EdgeLine>;
  orientation: MapOrientation;
  availableWidth?: number;
}

const COLUMN_WIDTH = { session: 224, workflow: 232, agent: 256, more: 256, group: 224 } as const;
const COLUMN_GAP = 52;
const SIBLING_GAP = 10;
const SESSION_GAP = 22;
const INDENT = 44;
const VERTICAL_SIBLING_GAP = 8;
const CARD_PADDING = 12;
const ORB_SIZE = 30;
const DEFAULT_HEIGHT = { node: 96, more: 44, group: 32 } as const;
const BEND_RADIUS = 12;
const EDGE_END_INSET = 8;
/** Distância do topo do card até o centro do ícone, de onde as ligações saem e chegam. */
export const ORB_CENTER_Y = CARD_PADDING + ORB_SIZE / 2;

const round = (amount: number) => Math.round(amount * 10) / 10;

const widthOf = (item: VisibleItem): number => (item.kind === 'node' ? COLUMN_WIDTH[item.nodeKind] : COLUMN_WIDTH[item.kind]);

const heightOf = (item: VisibleItem, heights: Record<string, number>): number =>
  heights[item.id] ?? (item.kind === 'node' ? DEFAULT_HEIGHT.node : DEFAULT_HEIGHT[item.kind]);

export function edgeLineOf({ status, lit, inEndedSession, frozen }: { status: string; lit: boolean; inEndedSession: boolean; frozen: boolean }): EdgeLine {
  if (inEndedSession) return 'ended';
  if (status === 'stale') return 'dotted';
  const state = lineState({ status, lit: lit && !frozen });
  return state === 'flow' ? 'flow' : state === 'dashed' ? 'dashed' : 'idle';
}

function horizontalPath(parent: PlacedItem, child: PlacedItem): string {
  const x1 = parent.x + parent.width;
  const x2 = child.x + EDGE_END_INSET;
  const middleX = round(x1 + (x2 - x1) * 0.55);
  const y1 = parent.y + ORB_CENTER_Y;
  const y2 = child.y + ORB_CENTER_Y;
  return `M${x1} ${y1} C${middleX} ${y1} ${middleX} ${y2} ${x2} ${y2}`;
}

function verticalPath(parent: PlacedItem, child: PlacedItem): string {
  const x1 = parent.x + ORB_CENTER_Y;
  const y1 = parent.y + CARD_PADDING + ORB_SIZE + 4;
  const x2 = child.x + EDGE_END_INSET;
  const y2 = child.y + ORB_CENTER_Y;
  return `M${x1} ${y1} L${x1} ${y2 - BEND_RADIUS} Q${x1} ${y2} ${x1 + BEND_RADIUS} ${y2} L${x2} ${y2}`;
}

/** Posição de cada card e curva de cada ligação, a partir das alturas medidas na tela. */
export function layoutMap({ items, heights, edgeLines, orientation, availableWidth = 360 }: LayoutInput): MapLayout {
  const horizontal = orientation === 'horizontal';
  const childrenOf = new Map<string | null, VisibleItem[]>();
  for (const item of items) childrenOf.set(item.parentId, [...(childrenOf.get(item.parentId) ?? []), item]);

  const subtreeHeights = new Map<string, number>();
  const measure = (item: VisibleItem): number => {
    const children = childrenOf.get(item.id) ?? [];
    const own = heightOf(item, heights);
    const childrenTotal = children.reduce((sum, child, index) => sum + measure(child) + (index > 0 ? (horizontal ? SIBLING_GAP : VERTICAL_SIBLING_GAP) : 0), 0);
    const total = horizontal ? Math.max(own, childrenTotal) : own + (children.length > 0 ? SIBLING_GAP + childrenTotal : 0);
    subtreeHeights.set(item.id, total);
    return total;
  };

  const placed: Record<string, PlacedItem> = {};
  const edges: PlacedEdge[] = [];
  const place = (item: VisibleItem, top: number, depth: number, columnX: number): void => {
    const width = horizontal ? widthOf(item) : availableWidth - depth * INDENT;
    const x = horizontal ? columnX : depth * INDENT;
    const here: PlacedItem = { id: item.id, x, y: top, width };
    placed[item.id] = here;
    let childTop = horizontal ? top : top + heightOf(item, heights) + SIBLING_GAP;
    for (const child of childrenOf.get(item.id) ?? []) {
      place(child, childTop, depth + 1, x + width + COLUMN_GAP);
      const placedChild = placed[child.id];
      if (placedChild) {
        const line: EdgeLine = child.kind === 'more' ? 'more' : edgeLines[child.id] ?? 'idle';
        edges.push({ id: `${item.id}->${child.id}`, sourceId: item.id, targetId: child.id, path: horizontal ? horizontalPath(here, placedChild) : verticalPath(here, placedChild), line });
      }
      childTop += (subtreeHeights.get(child.id) ?? 0) + (horizontal ? SIBLING_GAP : VERTICAL_SIBLING_GAP);
    }
  };

  let rootTop = 0;
  for (const root of childrenOf.get(null) ?? []) {
    measure(root);
    place(root, rootTop, 0, 0);
    rootTop += (subtreeHeights.get(root.id) ?? 0) + SESSION_GAP;
  }
  const bounds = Object.values(placed);
  return {
    placed,
    edges,
    width: bounds.reduce((widest, item) => Math.max(widest, item.x + item.width), 0),
    height: Math.max(0, rootTop - SESSION_GAP),
  };
}
