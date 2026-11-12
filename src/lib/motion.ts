import type { MapTree, VisibleItem } from './map-tree';
import type { AgentEvent } from './types';

const SECOND_MS = 1000;
export const SPARK_STEP_MS = 350;
export const SPARK_LIFETIME_MS = 3000;
export const ENTERING_MS = 4 * SECOND_MS;
const ACTIVE_WITHIN_MS = 12 * SECOND_MS;
const FAST_CLOCK_MS = SECOND_MS;
const SLOW_CLOCK_MS = 30 * SECOND_MS;

export type SparkKind = 'action' | 'done';
export interface LiveEvent { key: string; event: AgentEvent; receivedAt: number }
export interface EdgeSpark { sparkKey: string; kind: SparkKind; reverse: boolean; delayMs: number }

const sparkKindOf = (event: AgentEvent): SparkKind | null => {
  if (!event.agent_id) return null;
  if (event.event === 'PostToolUse') return 'action';
  return event.event === 'SubagentStop' ? 'done' : null;
};

// Do topo da árvore até o nó, sem o próprio nó repetido.
function pathFromRoot(tree: MapTree, nodeId: string): string[] {
  const path: string[] = [];
  for (let current: string | null | undefined = nodeId; current; current = tree.nodes[current]?.parentId) path.unshift(current);
  return path;
}

/** Faísca por linha: ação corre da sessão ao agente; conclusão volta do agente para quem o chamou. Só passa por linhas que estão na tela. */
export function sparksByEdge(liveEvents: LiveEvent[], tree: MapTree, items: VisibleItem[]): Record<string, EdgeSpark[]> {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const sparks: Record<string, EdgeSpark[]> = {};
  for (const { key, event } of liveEvents) {
    const kind = sparkKindOf(event);
    const nodeId = event.agent_id ? tree.nodeIdOfAgent[event.agent_id] : undefined;
    if (!kind || !nodeId) continue;
    const edgeIds = pathFromRoot(tree, nodeId).flatMap((id) => {
      const item = itemById.get(id);
      return item?.parentId && itemById.has(item.parentId) ? [`${item.parentId}->${id}`] : [];
    });
    const reverse = kind === 'done';
    (reverse ? edgeIds.reverse() : edgeIds).forEach((edgeId, index) => {
      (sparks[edgeId] ??= []).push({ sparkKey: key, kind, reverse, delayMs: index * SPARK_STEP_MS });
    });
  }
  return sparks;
}

export const pruneLiveEvents = (liveEvents: LiveEvent[], now: number): LiveEvent[] => liveEvents.filter(({ receivedAt }) => now - receivedAt <= SPARK_LIFETIME_MS);

/** Agente que acabou de começar entra deslizando; depois disso o card fica parado. */
export const isEntering = (startedAt: string | null | undefined, now: number): boolean => {
  if (!startedAt) return false;
  const age = now - Date.parse(startedAt);
  return age >= 0 && age <= ENTERING_MS;
};

/** Bate a cada segundo enquanto alguma ação ainda pode estar acesa (12 s) ou acabou de apagar; parado, a cada 30 s. */
export function liveClockMs(events: AgentEvent[], now: number): number {
  const hasRecentAction = events.some((event) => event.event === 'PostToolUse' && now - Date.parse(event.created_at) <= ACTIVE_WITHIN_MS + SECOND_MS);
  return hasRecentAction ? FAST_CLOCK_MS : SLOW_CLOCK_MS;
}
