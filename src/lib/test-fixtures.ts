import { buildBoard } from './board';
import type { AgentEvent, Board, BoardOptions, Session } from './types';
import { allSessionsOf } from './board';

export const NOW = Date.parse('2026-11-12T12:00:00Z');
export const UTC = 'UTC';
type EventExtra = Partial<AgentEvent>;

export const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60000).toISOString();
export const ev = (minutesAgo: number, event: string, extra: EventExtra = {}): AgentEvent => ({ login: 'joao', session_id: 's1', event, created_at: at(minutesAgo), ...extra });
export const evSeconds = (secondsAgo: number, event: string, extra: EventExtra = {}): AgentEvent => ({ login: 'joao', session_id: 's1', event, created_at: new Date(NOW - secondsAgo * 1000).toISOString(), ...extra });
export const boardOf = (events: AgentEvent[], options: BoardOptions = {}, now = NOW): Board => buildBoard(events, now, { timeZone: UTC, ...options });
export function firstSession(events: AgentEvent[], options: BoardOptions = {}, now = NOW): Session {
  const [session] = allSessionsOf(boardOf(events, options, now));
  if (!session) throw new Error('nenhuma sessão no board');
  return session;
}

export const sessionStart = (minutesAgo: number, extra: EventExtra = {}) => ev(minutesAgo, 'SessionStart', { cwd: '/home/joao/loja-web', branch: 'main', ...extra });
export const workflowStart = (minutesAgo: number, runId = 'wf_1', name = 'Revisão do checkout') => ev(minutesAgo, 'PostToolUse', { tool: 'Workflow', workflow_run_id: runId, workflow_name: name });
export const workflowAgentStart = (minutesAgo: number, agentId: string) => ev(minutesAgo, 'SubagentStart', { agent_id: agentId, agent_type: 'workflow-subagent' });
export const workflowAgentStop = (minutesAgo: number, agentId: string, extra: EventExtra = {}) =>
  ev(minutesAgo, 'SubagentStop', { agent_id: agentId, agent_type: 'workflow-subagent', workflow_run_id: 'wf_1', summary: 'VEREDITO: APROVADO', input_tokens: 1000, output_tokens: 200, ...extra });
export const looseAgentStart = (minutesAgo: number, agentId: string, type = 'logic-reviewer') => ev(minutesAgo, 'SubagentStart', { agent_id: agentId, agent_type: type });
export const looseAgentStop = (minutesAgo: number, agentId: string, type = 'logic-reviewer', extra: EventExtra = {}) =>
  ev(minutesAgo, 'SubagentStop', { agent_id: agentId, agent_type: type, summary: 'VEREDITO: APROVADO', input_tokens: 2000, output_tokens: 500, ...extra });
export const agentAction = (minutesAgo: number, agentId: string, tool = 'Read', summary = 'src/cart.ts') => ev(minutesAgo, 'PostToolUse', { agent_id: agentId, tool, summary });
