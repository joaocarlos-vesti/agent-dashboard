import { ViewportPortal } from '@xyflow/react';
import type { PlacedEdge } from '../../lib/map-layout';
import type { EdgeSpark } from '../../lib/motion';

const SPARK_RADIUS = 3.5;

interface SparkLayerProps {
  edges: PlacedEdge[];
  sparks: Record<string, EdgeSpark[]>;
}

// Fica fora das linhas do mapa: elas são recriadas a cada atualização da tela, e a faísca não pode recomeçar junto.
// A animação é de CSS: cada faísca começa ao entrar; o atraso escalona as linhas do caminho.
export function SparkLayer({ edges, sparks }: SparkLayerProps) {
  const sparkEdges = edges.filter((edge) => (sparks[edge.id]?.length ?? 0) > 0);
  if (sparkEdges.length === 0) return null;
  return (
    <ViewportPortal>
      <svg className="spark-layer" aria-hidden="true">
        {sparkEdges.flatMap((edge) => (sparks[edge.id] ?? []).map((spark) => (
          <circle
            key={`${spark.sparkKey}:${edge.id}`}
            className={`tree-spark tree-spark--${spark.kind}${spark.reverse ? ' tree-spark--back' : ''}`}
            r={SPARK_RADIUS}
            style={{ offsetPath: `path("${edge.path}")`, animationDelay: `${spark.delayMs}ms` }}
          />
        )))}
      </svg>
    </ViewportPortal>
  );
}
