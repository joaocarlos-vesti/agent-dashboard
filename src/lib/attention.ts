import { formatRelativeTime } from './format';
import type { Agent, AttentionItem, AttentionKind, Board, Session } from './types';

const ALL_CLEAR_TEXT = 'Tudo certo: ninguém esperando você, nada reprovado ou parado.';
const LOOSE_AGENT_REJECTION_STAYS_MS = 30 * 60 * 1000;
const KIND_ORDER: AttentionKind[] = ['waiting', 'your_turn', 'rejected', 'silent', 'stale'];
const SESSION_STATUSES_WITH_REJECTION = new Set(['running', 'waiting', 'your_turn']);

const agentsOf = (session: Session): Agent[] => [...session.agents, ...session.workflows.flatMap((workflow) => workflow.agents)];

// Reprovação de workflow vale até o workflow terminar; a de agente avulso, por 30 minutos.
function isRejectionStillRelevant(agent: Agent, now: number): boolean {
  if (!agent.rejectionReason) return false;
  if (agent.workflow) return agent.workflow.status !== 'done';
  return agent.endedAt !== undefined && now - Date.parse(agent.endedAt) <= LOOSE_AGENT_REJECTION_STAYS_MS;
}

function sessionItem(session: Session, now: number): AttentionItem | null {
  const since = formatRelativeTime(session.statusSince, now);
  const item = (kind: AttentionKind, text: string): AttentionItem => ({ kind, target: session.id, sessionId: session.id, text, at: session.statusSince });
  if (session.status === 'waiting') return item('waiting', `aguardando você ${since}`);
  if (session.status === 'your_turn' && session.recent) return item('your_turn', `terminou ${since}`);
  if (session.status === 'stale') return item('stale', `sem sinal ${since}`);
  return null;
}

function agentItems(session: Session, now: number): AttentionItem[] {
  return agentsOf(session).flatMap((agent) => {
    const item = (kind: AttentionKind, text: string, at: string): AttentionItem => ({ kind, target: agent.id, sessionId: session.id, text, at });
    const silent = session.status === 'running' && agent.silentSince != null ? [item('silent', `sem nova ação há ${agent.silentSince} min`, agent.lastActionAt)] : [];
    const rejected = SESSION_STATUSES_WITH_REJECTION.has(session.status) && isRejectionStillRelevant(agent, now) && agent.rejectionReason && agent.endedAt
      ? [item('rejected', agent.rejectionReason, agent.endedAt)]
      : [];
    return [...rejected, ...silent];
  });
}

const byKindThenNewest = (a: AttentionItem, b: AttentionItem) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || Date.parse(b.at) - Date.parse(a.at);

/** Fatos que pedem ação do dev, quem espera por ele primeiro. Só entram as sessões do mapa. */
export function attentionItems(board: Board, now: number): AttentionItem[] {
  return board
    .flatMap((person) => person.sessions)
    .flatMap((session) => [sessionItem(session, now), ...agentItems(session, now)])
    .filter((item): item is AttentionItem => item !== null)
    .sort(byKindThenNewest);
}

export const attentionHeadline = (items: AttentionItem[]): string | null => (items.length === 0 ? ALL_CLEAR_TEXT : null);
