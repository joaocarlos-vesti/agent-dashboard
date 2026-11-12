import { endedRhythm, rhythm } from './activity';
import { cardModel, type IconKey, type StateKey } from './card-model';
import { clockTime } from './day';
import { describeAction, describeSessionTokens, exactTime, folderName, formatRelativeTime, formatTokens } from './format';
import type { AgentUnit, MapTree, TreeNode } from './map-tree';
import type { AgentEvent, Tokens } from './types';
import { addTokens } from './usage';

export const NOTHING_SELECTED_TEXT = 'Clique numa sessão ou num agente para ver o detalhe.';

export interface DetailContext {
  now: number;
  timeZone: string | undefined;
  events: AgentEvent[];
  tree: MapTree;
  cloudSessionIds?: Set<string>;
  pastDay: boolean;
  taskExpanded: boolean;
}

export interface PermissionBlock { since: string; instruction: string; folder: string | null; branch: string | null; openSessionUrl: string | null }
export interface RecentAction { text: string; relative: string; exact: string }
export interface ActivityBlock {
  title: string;
  bars: number[];
  total: number;
  totalLabel: string;
  startLabel: string;
  endLabel: string;
  wholeSession: boolean;
  recentActions: RecentAction[];
  emptyText: string | null;
}
export interface CallBar { number: number; tokensText: string; widthPct: number; shareText: string; inProgress: boolean; outlier: boolean; outlierText: string | null; rejected: boolean; reason: string | null }
export interface CallsBlock { items: CallBar[]; medianText: string | null; medianPct: number; rejectedText: string | null; emptyText: string | null }
export interface ChildBar { id: string; title: string; icon: IconKey; state: StateKey; stateIcon: IconKey; tokensText: string; widthPct: number; alert: string | null; lit: boolean }
export interface TokensBlock { primaryText: string | null; unknownText: string | null; sharePct: number | null; shareText: string | null; exactText: string | null; cache: { creation: string; read: string } | null; daySplit: string | null }
export interface TaskBlock { text: string; canExpand: boolean; expanded: boolean }

export interface DetailModel {
  id: string;
  kind: TreeNode['kind'];
  icon: IconKey;
  title: string;
  path: string;
  state: StateKey;
  stateLabel: string;
  stateIcon: IconKey;
  stateDetail: string;
  probableSameAgent: boolean;
  lit: boolean;
  permission: PermissionBlock | null;
  lastReply: string | null;
  startMissingNotice: string | null;
  activity: ActivityBlock | null;
  calls: CallsBlock | null;
  childrenTitle: string | null;
  children: ChildBar[];
  tokens: TokensBlock;
  task: TaskBlock | null;
}

const RECENT_WINDOW_MS = 10 * 60 * 1000;
const RECENT_ACTIONS_SHOWN = 5;
const TASK_COLLAPSED_LIMIT = 140;
const OPEN_SESSION_URL = 'https://claude.ai/code';
const START_MISSING_TEXT = 'O início desta sessão não foi guardado (hook instalado depois do começo, sessão retomada ou início com mais de 7 dias).';
const UNKNOWN_TOKENS_TEXT = 'Tokens aparecem quando o agente termina.';
const NO_AGENTS_TEXT = 'Nenhum agente chamado nesta sessão.';
const NO_RECENT_ACTIONS_TEXT = 'Nenhuma ação nos últimos 10 min.';

const percentOf = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10;
const barWidth = (amount: number, largest: number) => (largest > 0 ? Math.max(2, percentOf(amount, largest)) : 2);
const formatCount = (amount: number) => Math.round(amount).toLocaleString('pt-BR');
const formatRatio = (ratio: number) => ratio.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function joinList(items: string[]): string {
  const last = items.at(-1);
  return items.length < 2 || !last ? items.join('') : `${items.slice(0, -1).join(', ')} e ${last}`;
}

const tokensOfNode = (node: TreeNode): Tokens => (node.kind === 'session' ? node.session.tokens.day : node.kind === 'workflow' ? addTokens(node.workflow.agents.map((agent) => agent.tokens)) : node.unit.tokens);

function agentIdsOf(node: TreeNode): string[] | null {
  if (node.kind === 'session') return null;
  return node.kind === 'workflow' ? node.workflow.agents.map((agent) => agent.id) : node.unit.agentIds;
}

function labelOfActor(tree: MapTree, agentId: string | null | undefined): string | null {
  const owner = agentId ? tree.nodes[tree.nodeIdOfAgent[agentId] ?? ''] : undefined;
  return owner?.kind === 'agent' ? owner.unit.label : null;
}

function actionEventsOf(node: TreeNode, sessionEvents: AgentEvent[]): AgentEvent[] {
  const agentIds = agentIdsOf(node);
  return sessionEvents.filter((event) => event.event === 'PostToolUse' && (!agentIds || (event.agent_id != null && agentIds.includes(event.agent_id))));
}

function activityOf(node: TreeNode, { now, timeZone, events, tree, pastDay }: DetailContext): ActivityBlock {
  const sessionEvents = events.filter((event) => event.session_id === node.session.id);
  const actions = actionEventsOf(node, sessionEvents);
  const actionTimes = actions.map((event) => Date.parse(event.created_at));
  const { session } = node;
  if (session.status === 'ended' || pastDay) {
    const startMs = Date.parse(session.startedAt);
    const endMs = Date.parse(session.endedAt ?? session.lastAt);
    const startLabel = clockTime(startMs, timeZone);
    const endLabel = clockTime(endMs, timeZone);
    const bars = endedRhythm(actionTimes, startMs, endMs);
    const total = sumOf(bars);
    return { title: 'Durante a sessão', bars, total, totalLabel: `${actionsWord(total)} na sessão (${startLabel}–${endLabel})`, startLabel, endLabel, wholeSession: true, recentActions: [], emptyText: null };
  }
  const bars = rhythm(actionTimes, now);
  const showsActor = node.kind !== 'agent';
  const recentActions = actions
    .filter((event) => now - Date.parse(event.created_at) <= RECENT_WINDOW_MS && Date.parse(event.created_at) <= now)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, RECENT_ACTIONS_SHOWN)
    .flatMap((event) => {
      const text = describeAction(event);
      const actor = showsActor ? labelOfActor(tree, event.agent_id) : null;
      return text ? [{ text: actor ? `${actor} · ${text}` : text, relative: formatRelativeTime(event.created_at, now), exact: exactTime(event.created_at, timeZone) }] : [];
    });
  const total = sumOf(bars);
  return {
    title: 'Agora', bars, total, totalLabel: `${actionsWord(total)} em 10 min`, startLabel: '10 min atrás', endLabel: 'agora',
    wholeSession: false, recentActions, emptyText: recentActions.length === 0 ? NO_RECENT_ACTIONS_TEXT : null,
  };
}

const sumOf = (counts: number[]) => counts.reduce((sum, count) => sum + count, 0);
const actionsWord = (total: number) => (total === 1 ? 'ação' : 'ações');

function permissionOf(node: TreeNode, { now, cloudSessionIds }: DetailContext): PermissionBlock | null {
  if (node.kind !== 'session' || node.session.status !== 'waiting') return null;
  const isCloud = cloudSessionIds?.has(node.session.id) ?? false;
  return {
    since: formatRelativeTime(node.session.statusSince, now),
    instruction: isCloud ? 'Responda na própria sessão.' : 'Responda no terminal:',
    folder: folderName(node.session.cwd),
    branch: node.session.branch,
    openSessionUrl: isCloud ? OPEN_SESSION_URL : null,
  };
}

function lastReplyOf(node: TreeNode, events: AgentEvent[], now: number): string | null {
  if (node.kind !== 'session' || node.session.status !== 'your_turn') return null;
  const lastStop = events.findLast((event) => event.session_id === node.session.id && event.event === 'Stop' && Date.parse(event.created_at) <= now);
  return lastStop?.summary?.trim() || null;
}

function callsOf(node: TreeNode): CallsBlock | null {
  if (node.kind === 'workflow') return null;
  if (node.kind === 'session') {
    const hasChildren = node.childIds.length > 0;
    return hasChildren ? null : { items: [], medianText: null, medianPct: 0, rejectedText: null, emptyText: NO_AGENTS_TEXT };
  }
  return callsOfUnit(node.unit);
}

function callsOfUnit(unit: AgentUnit): CallsBlock {
  const calls = [...unit.calls].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const largest = Math.max(0, ...calls.map((call) => call.tokens?.primary ?? 0));
  const { medianPrimary, outlierAgentIds } = unit.summary;
  const items = calls.map((call, index): CallBar => {
    const amount = call.tokens?.primary ?? null;
    const outlier = outlierAgentIds.includes(call.id);
    return {
      number: index + 1,
      tokensText: amount === null ? '—' : formatTokens(amount),
      widthPct: amount === null ? 0 : barWidth(amount, largest),
      shareText: call.status === 'running' ? 'em andamento' : amount === null || unit.tokens.primary === 0 ? '' : `${Math.round((amount / unit.tokens.primary) * 100)}% do agente`,
      inProgress: call.status === 'running',
      outlier,
      outlierText: outlier && amount !== null && medianPrimary ? `${formatRatio(amount / medianPrimary)}× a mediana` : null,
      rejected: call.rejectionReason !== null,
      reason: call.rejectionReason,
    };
  });
  const rejectedNumbers = items.filter((call) => call.rejected).map((call) => `nº ${call.number}`);
  return {
    items,
    medianText: medianPrimary === null ? null : formatTokens(medianPrimary),
    medianPct: medianPrimary === null || largest === 0 ? 0 : percentOf(medianPrimary, largest),
    rejectedText: rejectedNumbers.length === 0 ? null : `${rejectedNumbers.length} ${rejectedNumbers.length === 1 ? 'reprovada' : 'reprovadas'} (${joinList(rejectedNumbers)})`,
    emptyText: null,
  };
}

function childrenOf(node: TreeNode, context: DetailContext): { title: string | null; bars: ChildBar[] } {
  if (node.kind === 'agent' || node.childIds.length === 0) return { title: null, bars: [] };
  const childNodes = node.childIds.flatMap((childId) => context.tree.nodes[childId] ?? []);
  const amounts = childNodes.map((child) => tokensOfNode(child).primary);
  const largest = Math.max(0, ...amounts);
  const bars = childNodes.map((child, index): ChildBar => {
    const card = cardModel(child, { now: context.now, timeZone: context.timeZone, open: true, cloudSessionIds: context.cloudSessionIds });
    return {
      id: child.id, title: card.title, icon: card.icon, state: card.state, stateIcon: card.stateIcon, tokensText: formatTokens(amounts[index]),
      widthPct: barWidth(amounts[index] ?? 0, largest), alert: card.tags[0]?.text ?? null, lit: card.lit,
    };
  });
  return { title: node.kind === 'workflow' ? `Agentes · ${node.childIds.length}` : 'Abaixo desta sessão', bars };
}

function tokensBlockOf(node: TreeNode): TokensBlock {
  const tokens = tokensOfNode(node);
  const known = node.kind !== 'agent' || node.unit.tokensKnown;
  const sessionTotal = node.session.tokens.total.primary;
  const share = node.kind === 'session' || !known || sessionTotal === 0 ? null : tokens.primary / sessionTotal;
  const hasCache = tokens.cacheCreation > 0 || tokens.cacheRead > 0;
  const spansDays = node.kind === 'session' && Object.keys(node.session.tokens.byDay).length > 1;
  return {
    primaryText: known ? formatTokens(tokens.primary) : null,
    unknownText: known ? null : UNKNOWN_TOKENS_TEXT,
    sharePct: share === null ? null : Math.round(share * 100),
    shareText: share === null ? null : `${Math.round(share * 100)}% da sessão`,
    exactText: known ? `${formatCount(tokens.primary)} = entrada ${formatCount(tokens.input)} + saída ${formatCount(tokens.output)}` : null,
    cache: known && hasCache ? { creation: formatTokens(tokens.cacheCreation), read: formatTokens(tokens.cacheRead) } : null,
    daySplit: spansDays ? describeSessionTokens({ day: node.session.tokens.day, total: node.session.tokens.total }) : null,
  };
}

function taskOf(node: TreeNode, { taskExpanded }: DetailContext): TaskBlock | null {
  const text = node.kind === 'agent' ? node.unit.task : null;
  return text ? { text, canExpand: text.length > TASK_COLLAPSED_LIMIT, expanded: taskExpanded } : null;
}

function pathOf(node: TreeNode, context: DetailContext): string {
  if (node.kind === 'session') return context.cloudSessionIds?.has(node.id) ? 'Sessão na nuvem' : 'Sessão local';
  const titles: string[] = [];
  for (let parentId: string | null = node.parentId; parentId; parentId = context.tree.nodes[parentId]?.parentId ?? null) {
    const parent = context.tree.nodes[parentId];
    if (parent) titles.unshift(cardModel(parent, { now: context.now, timeZone: context.timeZone, open: true }).title);
  }
  return titles.join(' › ');
}

/** Tudo que o painel de detalhe mostra de um card, na ordem das perguntas do dev. */
export function detailModel(node: TreeNode, context: DetailContext): DetailModel {
  const card = cardModel(node, { now: context.now, timeZone: context.timeZone, open: true, cloudSessionIds: context.cloudSessionIds });
  const { title: childrenTitle, bars: children } = childrenOf(node, context);
  return {
    id: node.id, kind: node.kind, icon: card.icon, title: card.title, path: pathOf(node, context),
    state: card.state, stateLabel: card.stateLabel, stateIcon: card.stateIcon, stateDetail: card.stateDetail, probableSameAgent: card.probableSameAgent, lit: card.lit,
    permission: permissionOf(node, context),
    lastReply: lastReplyOf(node, context.events, context.now),
    startMissingNotice: node.kind === 'session' && node.session.startMissingNotice ? START_MISSING_TEXT : null,
    activity: activityOf(node, context),
    calls: callsOf(node),
    childrenTitle, children,
    tokens: tokensBlockOf(node),
    task: taskOf(node, context),
  };
}
