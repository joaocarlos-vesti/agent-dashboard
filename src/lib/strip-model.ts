import { attentionHeadline } from './attention';
import { cardModel, type IconKey } from './card-model';
import { resolveNodeId, revealPathOf, type MapTree } from './map-tree';
import type { RevealPath } from './ui-state';
import type { AttentionItem, AttentionKind } from './types';

export type StripTone = 'waiting' | 'yourTurn' | 'alert';

export interface StripChip {
  key: string;
  kind: AttentionKind;
  tone: StripTone;
  icon: IconKey;
  name: string;
  fact: string;
  nodeId: string;
  reveal: RevealPath | null;
}

export interface StripModel { headline: string | null; chips: StripChip[] }

const TONE: Record<AttentionKind, StripTone> = { waiting: 'waiting', your_turn: 'yourTurn', rejected: 'alert', silent: 'alert', stale: 'alert' };
const ICON: Record<AttentionKind, IconKey> = { waiting: 'waiting', your_turn: 'yourTurn', rejected: 'rejected', silent: 'silent', stale: 'stale' };
const PAST_DAY_HIDDEN: AttentionKind[] = ['waiting', 'your_turn'];

/** Os botões da faixa do topo; cada um já traz o card de destino e o que abrir para ele aparecer. */
export function stripModel({ items, tree, now, timeZone, pastDay }: { items: AttentionItem[]; tree: MapTree; now: number; timeZone: string | undefined; pastDay: boolean }): StripModel {
  const chips = items
    .filter((item) => !(pastDay && PAST_DAY_HIDDEN.includes(item.kind)))
    .flatMap((item): StripChip[] => {
      const nodeId = resolveNodeId(tree, item.target);
      const node = nodeId ? tree.nodes[nodeId] : undefined;
      if (!nodeId || !node) return [];
      const { title } = cardModel(node, { now, timeZone, open: true });
      return [{ key: `${item.kind}:${item.target}`, kind: item.kind, tone: TONE[item.kind], icon: ICON[item.kind], name: title, fact: item.text, nodeId, reveal: revealPathOf(tree, nodeId) }];
    });
  return { headline: attentionHeadline(items.filter((item) => chips.some((chip) => chip.key === `${item.kind}:${item.target}`))), chips };
}
