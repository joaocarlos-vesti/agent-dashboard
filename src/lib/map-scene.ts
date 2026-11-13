import { cardModel, sessionTitleOf, type CardModel } from './card-model';
import { edgeLineOf, type EdgeLine } from './map-layout';
import { buildMapTree, isNodeOpen, visibleItems, type MapTree, type TreeNode, type VisibleItem } from './map-tree';
import type { Board } from './types';
import type { UiState } from './ui-state';

export interface MapScene {
  tree: MapTree;
  items: VisibleItem[];
  cards: Record<string, CardModel>;
  edgeLines: Record<string, EdgeLine>;
  hasSessions: boolean;
}

export interface MapSceneInput {
  board: Board;
  ui: Pick<UiState, 'nodeOpen' | 'openGroups' | 'expandedWorkflows'>;
  now: number;
  timeZone: string | undefined;
  pastDay: boolean;
}

const statusOf = (node: TreeNode): string => (node.kind === 'workflow' ? node.workflow.status : node.kind === 'agent' ? node.unit.status : node.session.status);

/** Tudo que o mapa precisa para desenhar: os cards visíveis, já em texto, e o estado de cada linha. */
export function buildMapScene({ board, ui, now, timeZone, pastDay }: MapSceneInput): MapScene {
  const tree = buildMapTree(board, { pastDay });
  const items = visibleItems(tree, ui);
  const sessionTitles = Object.values(tree.nodes).flatMap((node) => (node.kind === 'session' ? [sessionTitleOf(node.session)] : []));
  const repeatsName = (node: TreeNode) => node.kind === 'session' && sessionTitles.filter((title) => title === sessionTitleOf(node.session)).length > 1;
  const cards: Record<string, CardModel> = {};
  const edgeLines: Record<string, EdgeLine> = {};
  for (const item of items) {
    const node = item.kind === 'node' ? tree.nodes[item.id] : undefined;
    if (!node) continue;
    const card = cardModel(node, { now, timeZone, open: isNodeOpen(tree, node.id, ui.nodeOpen), distinguishSession: repeatsName(node) });
    cards[node.id] = card;
    if (node.kind !== 'session') edgeLines[node.id] = edgeLineOf({ status: statusOf(node), lit: card.lit, inEndedSession: node.session.status === 'ended', frozen: pastDay });
  }
  return { tree, items, cards, edgeLines, hasSessions: tree.mainIds.length + tree.groupIds.endedToday.length + tree.groupIds.openIdle.length > 0 };
}
