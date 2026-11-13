import { useCallback, useMemo, useState } from 'react';
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasWidth } from '../../hooks/useCanvasWidth';
import { useFocusOnSelected } from '../../hooks/useFocusOnSelected';
import { useLatestRef } from '../../hooks/useLatestRef';
import type { CardModel } from '../../lib/card-model';
import type { MapOrientation } from '../../lib/layout-mode';
import { layoutMap, type MapLayout } from '../../lib/map-layout';
import type { CollapsibleGroupId, VisibleItem } from '../../lib/map-tree';
import type { MapScene } from '../../lib/map-scene';
import type { EdgeSpark } from '../../lib/motion';
import { CardNodeView, GroupNodeView, MoreNodeView, type CardNode, type GroupNode, type MoreNode } from './MapNodes';
import { SparkLayer } from './SparkLayer';
import { TreeEdgeView, type TreeEdgeType } from './TreeEdge';

const NODE_TYPES = { card: CardNodeView, group: GroupNodeView, more: MoreNodeView };
const EDGE_TYPES = { tree: TreeEdgeView };
const HEIGHT_TOLERANCE_PX = 0.5;
const PAN_MARGIN = 400;

export interface MapActions {
  onActivateCard: (card: CardModel) => void;
  onToggleCard: (card: CardModel) => void;
  onToggleGroup: (group: CollapsibleGroupId) => void;
  onShowAllAgents: (workflowId: string) => void;
  onCollapseAll: () => void;
}

interface MapViewProps extends MapActions {
  scene: MapScene;
  orientation: MapOrientation;
  selectedId: string | null;
  focusNonce: number;
  frozen: boolean;
  sparks: Record<string, EdgeSpark[]>;
}

type MapNode = CardNode | GroupNode | MoreNode;

function useMeasuredHeights() {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const reportHeight = useCallback((id: string, height: number) => {
    setHeights((current) => (Math.abs((current[id] ?? 0) - height) < HEIGHT_TOLERANCE_PX ? current : { ...current, [id]: height }));
  }, []);
  return { heights, reportHeight };
}

function nodeOf(item: VisibleItem, scene: MapScene, selectedId: string | null, actions: MapActions & { reportHeight: (id: string, height: number) => void }): MapNode | null {
  const base = { id: item.id, position: { x: 0, y: 0 }, draggable: false, selectable: false, connectable: false, focusable: false };
  if (item.kind === 'group') return { ...base, type: 'group', data: { label: item.label, open: item.open, onToggle: () => actions.onToggleGroup(item.group), onHeight: actions.reportHeight } };
  if (item.kind === 'more') return { ...base, type: 'more', data: { label: item.label, onShow: () => actions.onShowAllAgents(item.workflowId), onHeight: actions.reportHeight } };
  const card = scene.cards[item.id];
  return card ? { ...base, type: 'card', data: { card, selected: selectedId === item.id, onActivate: actions.onActivateCard, onToggle: actions.onToggleCard, onHeight: actions.reportHeight } } : null;
}

function toFlowElements(layout: MapLayout, nodes: MapNode[], heights: Record<string, number>): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: nodes.flatMap((node) => {
      const placed = layout.placed[node.id];
      return placed ? [{ ...node, position: { x: placed.x, y: placed.y }, width: placed.width, height: heights[node.id] }] : [];
    }),
    edges: layout.edges.map((edge): TreeEdgeType => ({ id: edge.id, source: edge.sourceId, target: edge.targetId, type: 'tree', data: { path: edge.path, line: edge.line }, selectable: false, focusable: false })),
  };
}

function MapCanvas({ scene, orientation, selectedId, focusNonce, frozen, sparks, ...actions }: MapViewProps) {
  const { heights, reportHeight } = useMeasuredHeights();
  const { canvasRef, availableWidth } = useCanvasWidth();
  const latestActions = useLatestRef<MapActions>(actions);
  const stableActions = useMemo<MapActions>(() => ({
    onActivateCard: (card) => latestActions.current.onActivateCard(card),
    onToggleCard: (card) => latestActions.current.onToggleCard(card),
    onToggleGroup: (group) => latestActions.current.onToggleGroup(group),
    onShowAllAgents: (workflowId) => latestActions.current.onShowAllAgents(workflowId),
    onCollapseAll: () => latestActions.current.onCollapseAll(),
  }), [latestActions]);

  const layout = useMemo(
    () => layoutMap({ items: scene.items, heights, edgeLines: scene.edgeLines, orientation, availableWidth }),
    [scene.items, scene.edgeLines, heights, orientation, availableWidth],
  );
  const mapNodes = useMemo(
    () => scene.items.flatMap((item) => nodeOf(item, scene, selectedId, { ...stableActions, reportHeight }) ?? []),
    [scene, selectedId, stableActions, reportHeight],
  );
  const { nodes, edges } = useMemo(() => toFlowElements(layout, mapNodes, heights), [layout, mapNodes, heights]);
  useFocusOnSelected({ focusNonce, selectedId, layout, heights });

  return (
    <div className="map-area">
      {orientation === 'horizontal' && (
        <div className="map-toolbar">
          <button type="button" className="map-toolbar__button" onClick={stableActions.onCollapseAll}>Recolher tudo</button>
        </div>
      )}
      <div ref={canvasRef} className={`map-canvas${frozen ? ' map-canvas--frozen' : ''}`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          defaultViewport={{ x: 16, y: 16, zoom: 1 }}
          minZoom={0.4}
          maxZoom={1.5}
          translateExtent={[[-PAN_MARGIN, -PAN_MARGIN], [layout.width + PAN_MARGIN, layout.height + PAN_MARGIN]]}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll={false}
          zoomOnDoubleClick={false}
          colorMode="dark"
          aria-label="Mapa das sessões"
        >
          <SparkLayer edges={layout.edges} sparks={sparks} />
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#26262B" />
        </ReactFlow>
      </div>
    </div>
  );
}

export function MapView(props: MapViewProps) {
  return <ReactFlowProvider><MapCanvas {...props} /></ReactFlowProvider>;
}

