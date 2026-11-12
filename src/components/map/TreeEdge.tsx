import type { Edge, EdgeProps } from '@xyflow/react';
import type { EdgeLine } from '../../lib/map-layout';

export type TreeEdgeType = Edge<{ path: string; line: EdgeLine }, 'tree'>;

/** A curva vem pronta do layout; o estado da linha só escolhe a classe de estilo. */
export function TreeEdgeView({ data }: EdgeProps<TreeEdgeType>) {
  if (!data) return null;
  return <path className={`tree-edge tree-edge--${data.line}`} d={data.path} fill="none" strokeLinecap="round" />;
}
