/** Linha da tabela `events`, como o Supabase devolve. Só `login`, `session_id`, `event` e `created_at` são sempre preenchidos. */
export interface AgentEvent {
  id?: number;
  login: string;
  session_id: string;
  event: string;
  created_at: string;
  cwd?: string | null;
  branch?: string | null;
  agent_id?: string | null;
  agent_type?: string | null;
  workflow_run_id?: string | null;
  workflow_name?: string | null;
  tool?: string | null;
  summary?: string | null;
  task?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_tokens?: number | null;
  cache_read_tokens?: number | null;
  tokens_by_model?: Record<string, TokenColumns> | null;
  duration_ms?: number | null;
  prompt_id?: string | null;
  occurred_at?: string | null;
}

export interface TokenColumns {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

export interface Tokens {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  primary: number;
}

export type SessionStatus = 'running' | 'waiting' | 'your_turn' | 'stale' | 'ended';
export type AgentStatus = 'running' | 'done' | 'stale';
export type WorkflowStatus = 'running' | 'done';

export interface Workflow {
  runId: string | null | undefined;
  name: string | null | undefined;
  status: WorkflowStatus;
  agents: Agent[];
  agentGroups: WorkflowAgentGroup[];
  visibleAgents: Agent[];
  hiddenDone: number;
  hiddenDoneLabel: string | null;
  actionAt: number[];
  lit: boolean;
}

export interface Agent {
  id: string;
  type: string | null | undefined;
  status: AgentStatus;
  task: string | null | undefined;
  workflow: Workflow | null;
  startedAt: string;
  lastActionAt: string;
  toolInFlight: boolean;
  tokens: Tokens | null;
  actionAt: number[];
  lastAction?: string;
  result?: string | null;
  endedAt?: string;
  silentSince: number | null;
  rejectionReason: string | null;
  label: string;
  lit: boolean;
}

/** Um agente, ou vários chamados com a mesma tarefa, com os números somados. */
export interface CallGroup<TCall = Agent> {
  callCount: number;
  agents: TCall[];
  tokens: Tokens;
  sessionShare: number | null;
  rejectedCount: number;
  medianPrimary: number | null;
  outlierAgentIds: string[];
}

export interface LooseAgentGroup extends CallGroup {
  type: string | null | undefined;
}

export interface WorkflowAgentGroup extends CallGroup {
  startOfTask: string | null;
  probableSameAgent: boolean;
}

export interface SessionTokens {
  conversation: Tokens;
  agents: Tokens;
  total: Tokens;
  byDay: Record<string, Tokens>;
  day: Tokens;
}

export interface Session {
  id: string;
  cwd: string | null | undefined;
  branch: string | null;
  status: SessionStatus;
  recent: boolean;
  sinceLabel: string | null;
  statusSince: string;
  waitingReason: string | null;
  startMissing: boolean;
  startMissingNotice: string | null;
  startedAt: string;
  endedAt: string | null;
  startedLabel: string | null;
  continuesAfter: string | null;
  resumedAt: string | null;
  tokens: SessionTokens;
  lastAt: string;
  workflows: Workflow[];
  agents: Agent[];
  agentGroups: LooseAgentGroup[];
  actionAt: number[];
  actionsByDay: Record<string, number>;
  lit: boolean;
}

export interface Person {
  login: string;
  sessions: Session[];
  openIdle: Session[];
  endedToday: Session[];
}

export type Board = Person[];

export interface BoardOptions {
  timeZone?: string;
  day?: string;
  connected?: boolean;
  lastUpdateAt?: number;
}

export type AttentionKind = 'waiting' | 'your_turn' | 'rejected' | 'silent' | 'stale';

export interface AttentionItem {
  kind: AttentionKind;
  target: string;
  sessionId: string;
  text: string;
  at: string;
}
