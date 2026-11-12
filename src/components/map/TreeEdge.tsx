import type { Edge, EdgeProps } from '@xyflow/react';
import type { EdgeLine } from '../../lib/map-layout';
import type { EdgeSpark } from '../../lib/motion';

export type TreeEdgeType = Edge<{ path: string; line: EdgeLine; sparks: EdgeSpark[] }, 'tree'>;

const SPARK_DURATION_S = 0.9;
const SPARK_RADIUS = 3.5;

// A bolinha corre pelo mesmo caminho da linha; antes de começar fica invisível. Na volta (conclusão), o trajeto é percorrido ao contrário.
function SparkDot({ path, spark }: { path: string; spark: EdgeSpark }) {
  const delay = `${spark.delayMs}ms`;
  return (
    <circle className={`tree-spark tree-spark--${spark.kind}`} r={SPARK_RADIUS} opacity="0">
      <animateMotion path={path} dur={`${SPARK_DURATION_S}s`} begin={delay} fill="freeze" calcMode="linear" keyPoints={spark.reverse ? '1;0' : '0;1'} keyTimes="0;1" />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur={`${SPARK_DURATION_S}s`} begin={delay} fill="freeze" />
    </circle>
  );
}

/** A curva vem pronta do layout; o estado da linha só escolhe a classe de estilo, e cada ação real vira uma faísca. */
export function TreeEdgeView({ data }: EdgeProps<TreeEdgeType>) {
  if (!data) return null;
  return (
    <>
      <path className={`tree-edge tree-edge--${data.line}`} d={data.path} fill="none" strokeLinecap="round" />
      {data.sparks.map((spark) => <SparkDot key={spark.sparkKey} path={data.path} spark={spark} />)}
    </>
  );
}
