import { addTokens, summarizeCalls } from './usage';
import type { Agent, Board, CallGroup, Session, Tokens, Workflow } from './types';
import type { RevealPath, UiState } from './ui-state';

export type NodeKind = 'session' | 'workflow' | 'agent';
export type CollapsibleGroupId = 'endedToday' | 'openIdle';

/** Um card de agente no mapa: uma chamada de workflow ou todas as chamadas avulsas do mesmo tipo. */
export interface AgentUnit {
  id: string;
  agentIds: string[];
  label: string;
  task: string | null;
  status: Agent['status'];
  startedAt: string;
  endedAt: string | null;
  lastActionAt: string;
  lastAction: string | null;
  toolInFlight: boolean;
  silentSince: number | null;
  rejectedCount: number;
  callCount: number;
  tokens: Tokens;
  tokensKnown: boolean;
  actionAt: number[];
  lit: boolean;
  probableSameAgent: boolean;
  calls: Agent[];
  summary: CallGroup<Agent>;
}

export type TreeNode =
  | { id: string; kind: 'session'; parentId: null; session: Session; childIds: string[] }
  | { id: string; kind: 'workflow'; parentId: string; session: Session; workflow: Workflow; childIds: string[] }
  | { id: string; kind: 'agent'; parentId: string; session: Session; unit: AgentUnit; childIds: string[] };

export interface MapTree {
  pastDay: boolean;
  nodes: Record<string, TreeNode>;
  mainIds: string[];
  groupIds: Record<CollapsibleGroupId, string[]>;
  nodeIdOfAgent: Record<string, string>;
}

export type VisibleItem =
  | { kind: 'node'; id: string; parentId: string | null; nodeKind: NodeKind }
  | { kind: 'group'; id: string; parentId: null; group: CollapsibleGroupId; label: string; open: boolean }
  | { kind: 'more'; id: string; parentId: string; workflowId: string; label: string };

type VisibilityState = Pick<UiState, 'nodeOpen' | 'openGroups' | 'expandedWorkflows'>;

const groupNodeId = (group: CollapsibleGroupId) => `group::${group}`;
const moreNodeId = (workflowId: string) => `more::${workflowId}`;
const timeOf = (instant: string) => Date.parse(instant);

function unitOfWorkflowAgent(agent: Agent, group: CallGroup<Agent> | undefined, probableSameAgent: boolean, sessionTotalPrimary: number): AgentUnit {
  return unitOfCalls({ id: agent.id, label: agent.label, calls: [agent], summary: group ?? summarizeCalls([agent], sessionTotalPrimary), probableSameAgent });
}

function unitOfCalls({ id, label, calls, summary, probableSameAgent }: { id: string; label: string; calls: Agent[]; summary: CallGroup<Agent>; probableSameAgent: boolean }): AgentUnit {
  const running = calls.filter((call) => call.status === 'running');
  const latestRunning = running.reduce<Agent | undefined>((latest, call) => (!latest || timeOf(call.lastActionAt) > timeOf(latest.lastActionAt) ? call : latest), undefined);
  const latestCall = calls.reduce<Agent | undefined>((latest, call) => (!latest || timeOf(call.lastActionAt) > timeOf(latest.lastActionAt) ? call : latest), undefined);
  const lastWithActivity = latestRunning ?? latestCall;
  const endedAts = calls.map((call) => call.endedAt).filter((endedAt): endedAt is string => endedAt !== undefined);
  const status: Agent['status'] = running.length > 0 ? 'running' : calls.some((call) => call.status === 'stale') ? 'stale' : 'done';
  return {
    id,
    agentIds: calls.map((call) => call.id),
    label,
    task: calls.find((call) => call.task)?.task ?? null,
    status,
    startedAt: calls.map((call) => call.startedAt).sort()[0] ?? '',
    endedAt: status === 'done' ? endedAts.sort().at(-1) ?? null : null,
    lastActionAt: lastWithActivity?.lastActionAt ?? '',
    lastAction: lastWithActivity?.lastAction ?? null,
    toolInFlight: lastWithActivity?.toolInFlight ?? false,
    silentSince: latestRunning?.silentSince ?? null,
    rejectedCount: calls.filter((call) => call.rejectionReason).length,
    callCount: calls.length,
    tokens: addTokens(calls.map((call) => call.tokens)),
    tokensKnown: calls.some((call) => call.tokens !== null),
    actionAt: calls.flatMap((call) => call.actionAt),
    lit: calls.some((call) => call.lit),
    probableSameAgent,
    calls,
    summary,
  };
}

const workflowNodeId = (sessionId: string, workflow: Workflow, position: number) => `${sessionId}::wf::${workflow.runId ?? position}`;
const looseAgentNodeId = (sessionId: string, type: string | null | undefined) => `${sessionId}::agents::${type ?? 'agente'}`;

function addSessionNodes(session: Session, tree: Pick<MapTree, 'nodes' | 'nodeIdOfAgent'>): void {
  const sessionNode: TreeNode = { id: session.id, kind: 'session', parentId: null, session, childIds: [] };
  tree.nodes[session.id] = sessionNode;
  session.workflows.forEach((workflow, position) => {
    const workflowId = workflowNodeId(session.id, workflow, position);
    const workflowNode: TreeNode = { id: workflowId, kind: 'workflow', parentId: session.id, session, workflow, childIds: [] };
    tree.nodes[workflowId] = workflowNode;
    sessionNode.childIds.push(workflowId);
    for (const agent of workflow.agents) {
      const group = workflow.agentGroups.find((candidate) => candidate.agents.includes(agent));
      const unit = unitOfWorkflowAgent(agent, group, group?.probableSameAgent ?? false, session.tokens.total.primary);
      tree.nodes[agent.id] = { id: agent.id, kind: 'agent', parentId: workflowId, session, unit, childIds: [] };
      tree.nodeIdOfAgent[agent.id] = agent.id;
      workflowNode.childIds.push(agent.id);
    }
  });
  // A ordem dos grupos avulsos vem por tokens; no mapa vale a hora de início da primeira chamada.
  const looseGroups = [...session.agentGroups].sort((a, b) => timeOf(a.agents[0]?.startedAt ?? '') - timeOf(b.agents[0]?.startedAt ?? ''));
  for (const group of looseGroups) {
    const id = looseAgentNodeId(session.id, group.type);
    const unit = unitOfCalls({ id, label: group.type || 'agente', calls: group.agents, summary: group, probableSameAgent: false });
    tree.nodes[id] = { id, kind: 'agent', parentId: session.id, session, unit, childIds: [] };
    for (const agent of group.agents) tree.nodeIdOfAgent[agent.id] = id;
    sessionNode.childIds.push(id);
  }
}

/** Monta os nós do mapa a partir do board. Em dia passado, as sessões encerradas ficam na lista normal. */
export function buildMapTree(board: Board, { pastDay }: { pastDay: boolean }): MapTree {
  const tree: MapTree = { pastDay, nodes: {}, mainIds: [], groupIds: { endedToday: [], openIdle: [] }, nodeIdOfAgent: {} };
  const byStart = (a: Session, b: Session) => timeOf(a.startedAt) - timeOf(b.startedAt);
  const sessionsOf = (pick: (person: Board[number]) => Session[]) => board.flatMap(pick);
  const main = sessionsOf((person) => (pastDay ? [...person.sessions, ...person.openIdle, ...person.endedToday] : person.sessions)).sort(byStart);
  const openIdle = pastDay ? [] : sessionsOf((person) => person.openIdle);
  const endedToday = pastDay ? [] : sessionsOf((person) => person.endedToday);
  for (const session of [...main, ...openIdle, ...endedToday]) addSessionNodes(session, tree);
  tree.mainIds = main.map((session) => session.id);
  tree.groupIds = { openIdle: openIdle.map((session) => session.id), endedToday: endedToday.map((session) => session.id) };
  return tree;
}

export function isNodeOpen(tree: MapTree, nodeId: string, nodeOpen: Record<string, boolean>): boolean {
  const choice = nodeOpen[nodeId];
  if (choice !== undefined) return choice;
  const node = tree.nodes[nodeId];
  return !(node?.kind === 'session' && node.session.status === 'ended' && !tree.pastDay);
}

const GROUP_LABELS: Record<CollapsibleGroupId, string> = { openIdle: 'Abertas, sem atividade hoje', endedToday: 'Encerradas hoje' };
const GROUP_ORDER: CollapsibleGroupId[] = ['openIdle', 'endedToday'];

function visibleDescendants(tree: MapTree, state: VisibilityState, nodeId: string, items: VisibleItem[]): void {
  const node = tree.nodes[nodeId];
  if (!node) return;
  items.push({ kind: 'node', id: nodeId, parentId: node.parentId, nodeKind: node.kind });
  if (!isNodeOpen(tree, nodeId, state.nodeOpen)) return;
  const showAllAgents = state.expandedWorkflows.includes(nodeId);
  const hiddenIds = node.kind === 'workflow' && !showAllAgents ? new Set(node.childIds.filter((id) => !node.workflow.visibleAgents.some((agent) => agent.id === id))) : new Set<string>();
  for (const childId of node.childIds) if (!hiddenIds.has(childId)) visibleDescendants(tree, state, childId, items);
  if (node.kind === 'workflow' && hiddenIds.size > 0 && node.workflow.hiddenDoneLabel) {
    items.push({ kind: 'more', id: moreNodeId(nodeId), parentId: nodeId, workflowId: nodeId, label: node.workflow.hiddenDoneLabel });
  }
}

/** A lista plana do que está na tela, na ordem em que o mapa desenha (pai antes dos filhos). */
export function visibleItems(tree: MapTree, state: VisibilityState): VisibleItem[] {
  const items: VisibleItem[] = [];
  for (const sessionId of tree.mainIds) visibleDescendants(tree, state, sessionId, items);
  for (const group of GROUP_ORDER) {
    const sessionIds = tree.groupIds[group];
    if (sessionIds.length === 0) continue;
    const open = state.openGroups[group];
    items.push({ kind: 'group', id: groupNodeId(group), parentId: null, group, label: `${GROUP_LABELS[group]} (${sessionIds.length})`, open });
    if (open) for (const sessionId of sessionIds) visibleDescendants(tree, state, sessionId, items);
  }
  return items;
}

/** O id de um card do mapa a partir de qualquer id da faixa (um agente avulso vira o card do tipo dele). */
export function resolveNodeId(tree: MapTree, id: string): string | null {
  if (tree.nodes[id]) return id;
  return tree.nodeIdOfAgent[id] ?? null;
}

/** O que abrir para o item aparecer: pais, grupo recolhido e os concluídos escondidos do workflow. */
export function revealPathOf(tree: MapTree, id: string): RevealPath | null {
  const nodeId = resolveNodeId(tree, id);
  const node = nodeId ? tree.nodes[nodeId] : undefined;
  if (!nodeId || !node) return null;
  const ancestorIds: string[] = [];
  for (let parentId = node.parentId; parentId; parentId = tree.nodes[parentId]?.parentId ?? null) ancestorIds.unshift(parentId);
  const rootId = ancestorIds[0] ?? nodeId;
  const group = GROUP_ORDER.find((candidate) => tree.groupIds[candidate].includes(rootId)) ?? null;
  const parent = node.parentId ? tree.nodes[node.parentId] : undefined;
  const hiddenByWorkflow = node.kind === 'agent' && parent?.kind === 'workflow' && !parent.workflow.visibleAgents.some((agent) => agent.id === nodeId);
  return { ancestorIds, group, workflowId: hiddenByWorkflow && parent ? parent.id : null };
}

export const nodesWithChildren = (tree: MapTree): string[] => Object.values(tree.nodes).filter((node) => node.childIds.length > 0).map((node) => node.id);
