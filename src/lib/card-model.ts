import { clockTime } from './day';
import { heartbeat } from './activity';
import { folderName, formatRelativeTime, formatTokens } from './format';
import type { AgentUnit, TreeNode } from './map-tree';
import { addTokens } from './usage';
import type { Session } from './types';

export type IconKey =
  | 'terminal' | 'cloud' | 'workflow' | 'robot' | 'running' | 'done' | 'waiting' | 'yourTurn' | 'stale' | 'ended'
  | 'rejected' | 'silent' | 'outlier' | 'probable' | 'close' | 'arrowRight' | 'chevronRight' | 'chevronDown' | 'external';
export type StateKey = 'running' | 'done' | 'waiting' | 'your_turn' | 'your_turn_old' | 'stale' | 'ended';
export type CardTone = 'default' | 'waiting' | 'lit' | 'alert' | 'yourTurn' | 'yourTurnOld' | 'stale' | 'ended';
export type CardTagKind = 'rejected' | 'silent';

export interface CardTag { kind: CardTagKind; text: string; icon: IconKey }

export interface CardModel {
  id: string;
  kind: 'session' | 'workflow' | 'agent';
  title: string;
  titleHint: string;
  icon: IconKey;
  state: StateKey;
  stateLabel: string;
  stateIcon: IconKey;
  stateDetail: string;
  actionText: string | null;
  tokensText: string | null;
  tokensCaption: string;
  tags: CardTag[];
  marks: string[];
  heartbeat: number[];
  showsHeartbeat: boolean;
  childCount: number;
  open: boolean;
  tone: CardTone;
  lit: boolean;
  probableSameAgent: boolean;
  ariaLabel: string;
}

export interface CardContext {
  now: number;
  timeZone: string | undefined;
  open: boolean;
  cloudSessionIds?: ReadonlySet<string>;
}

const STATE_PRESENTATION: Record<StateKey, { label: string; icon: IconKey }> = {
  running: { label: 'rodando', icon: 'running' },
  done: { label: 'concluído', icon: 'done' },
  waiting: { label: 'aguardando você', icon: 'waiting' },
  your_turn: { label: 'sua vez', icon: 'yourTurn' },
  your_turn_old: { label: 'sua vez', icon: 'yourTurn' },
  stale: { label: 'sem sinal', icon: 'stale' },
  ended: { label: 'encerrada', icon: 'ended' },
};

/** Palavra e ícone de cada estado; o mapa e o painel usam a mesma tabela. */
export const statePresentation = (state: StateKey) => STATE_PRESENTATION[state];

const NODE_LABEL = { session: 'Sessão', workflow: 'Workflow', agent: 'Agente' } as const;
const pluralize = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

function sinceText(instant: string, now: number): string {
  const relative = formatRelativeTime(instant, now);
  return relative === 'agora' ? 'agora' : relative;
}

function sessionState(session: Session): StateKey {
  if (session.status === 'your_turn') return session.recent ? 'your_turn' : 'your_turn_old';
  if (session.status === 'ended' || session.status === 'stale' || session.status === 'waiting') return session.status;
  return 'running';
}

function sessionDetail(session: Session, now: number, timeZone: string | undefined): string {
  switch (session.status) {
    case 'running': return sinceText(session.startedAt, now);
    case 'waiting':
    case 'stale': return sinceText(session.statusSince, now);
    case 'your_turn': return session.recent ? session.sinceLabel ?? '' : (session.sinceLabel ?? '').replace(/^sua vez /, '');
    case 'ended': return `às ${clockTime(session.endedAt ?? session.lastAt, timeZone)}`;
  }
}

function sessionCaption(session: Session): string {
  const parts = [
    session.workflows.length > 0 ? pluralize(session.workflows.length, 'workflow', 'workflows') : null,
    session.agents.length > 0 ? pluralize(session.agents.length, 'agente', 'agentes') : null,
  ].filter(Boolean);
  return ['tokens', ...(parts.length > 0 ? parts : ['sem agentes'])].join(' · ');
}

function toneOf({ state, lit, tags }: { state: StateKey; lit: boolean; tags: CardTag[] }): CardTone {
  if (state === 'waiting') return 'waiting';
  if (lit) return 'lit';
  if (tags.length > 0) return 'alert';
  const byState: Partial<Record<StateKey, CardTone>> = { your_turn: 'yourTurn', your_turn_old: 'yourTurnOld', stale: 'stale', ended: 'ended' };
  return byState[state] ?? 'default';
}

type CardParts = Pick<CardModel, 'title' | 'titleHint' | 'icon' | 'state' | 'stateDetail' | 'actionText' | 'tokensText' | 'tokensCaption' | 'tags' | 'marks' | 'lit' | 'probableSameAgent'> & { actionAt: number[] };

function sessionParts(session: Session, { now, timeZone, isCloud }: { now: number; timeZone: string | undefined; isCloud: boolean }): CardParts {
  const title = folderName(session.cwd) ?? 'sessão';
  return {
    title, titleHint: title, icon: isCloud ? 'cloud' : 'terminal', state: sessionState(session), stateDetail: sessionDetail(session, now, timeZone),
    actionText: null, tokensText: formatTokens(session.tokens.day.primary), tokensCaption: sessionCaption(session), tags: [],
    marks: [
      session.startedLabel ? `← ${session.startedLabel}` : null,
      session.continuesAfter ? `${session.continuesAfter} →` : null,
      session.resumedAt,
    ].filter((mark): mark is string => mark !== null),
    lit: session.lit, probableSameAgent: false, actionAt: session.actionAt,
  };
}

function workflowParts(node: Extract<TreeNode, { kind: 'workflow' }>): CardParts {
  const { workflow, session } = node;
  const title = workflow.name ?? 'workflow';
  const runningCount = workflow.agents.filter((agent) => agent.status === 'running').length;
  const state: StateKey = workflow.status === 'done' ? 'done' : session.status === 'ended' || session.status === 'stale' ? session.status : 'running';
  return {
    title, titleHint: title, icon: 'workflow', state, stateDetail: state === 'running' ? `${runningCount} de ${workflow.agents.length} rodando` : '',
    actionText: null, tokensText: formatTokens(addTokens(workflow.agents.map((agent) => agent.tokens)).primary),
    tokensCaption: `tokens · ${pluralize(workflow.agents.length, 'agente', 'agentes')}`, tags: [], marks: [], lit: workflow.lit, probableSameAgent: false, actionAt: workflow.actionAt,
  };
}

function agentParts(unit: AgentUnit, now: number): CardParts {
  const state: StateKey = unit.status === 'stale' ? 'stale' : unit.status;
  const tags: CardTag[] = [
    ...(unit.rejectedCount > 0 ? [{ kind: 'rejected' as const, text: unit.callCount > 1 ? `REPROVADO · ${unit.rejectedCount} de ${unit.callCount}` : 'REPROVADO', icon: 'rejected' as const }] : []),
    ...(unit.silentSince !== null ? [{ kind: 'silent' as const, text: `sem nova ação há ${unit.silentSince} min`, icon: 'silent' as const }] : []),
  ];
  const since = state === 'done' ? unit.endedAt : unit.toolInFlight ? unit.lastActionAt : unit.startedAt;
  const action = unit.status === 'running' && unit.lastAction ? `${unit.lastAction} · ${sinceText(unit.lastActionAt, now)}` : null;
  return {
    title: unit.label, titleHint: unit.task ?? unit.label, icon: 'robot', state, stateDetail: since ? sinceText(since, now) : '',
    actionText: action, tokensText: unit.tokensKnown ? formatTokens(unit.tokens.primary) : null,
    tokensCaption: !unit.tokensKnown ? 'tokens ao terminar' : unit.callCount > 1 ? `tokens · ${unit.callCount} chamadas` : 'tokens',
    tags, marks: [], lit: unit.lit, probableSameAgent: unit.probableSameAgent, actionAt: unit.actionAt,
  };
}

// Sessão com filhos e workflow resumem os de baixo; só o que age sozinho mostra o batimento.
const hasPulseRow = (node: TreeNode) => node.kind === 'agent' || (node.kind === 'session' && node.childIds.length === 0);

/** Tudo que um card do mapa mostra, já em texto; o componente só desenha. */
export function cardModel(node: TreeNode, { now, timeZone, open, cloudSessionIds }: CardContext): CardModel {
  const parts = node.kind === 'session'
    ? sessionParts(node.session, { now, timeZone, isCloud: cloudSessionIds?.has(node.id) ?? false })
    : node.kind === 'workflow' ? workflowParts(node) : agentParts(node.unit, now);
  const { actionAt, ...shown } = parts;
  const presentation = statePresentation(shown.state);
  const pulse = heartbeat(actionAt, now);
  const tokensSpoken = shown.tokensText ? `, ${shown.tokensText} tokens` : '';
  return {
    ...shown,
    id: node.id,
    kind: node.kind,
    stateLabel: presentation.label,
    stateIcon: presentation.icon,
    heartbeat: pulse,
    showsHeartbeat: hasPulseRow(node) && (shown.state === 'running' || pulse.some((count) => count > 0)),
    childCount: node.childIds.length,
    open,
    tone: toneOf({ state: shown.state, lit: shown.lit, tags: shown.tags }),
    ariaLabel: `${NODE_LABEL[node.kind]} ${shown.title}, ${presentation.label}${tokensSpoken}`,
  };
}
