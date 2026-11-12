import type { Agent, AgentStatus, Board, Session, SessionStatus, Workflow, WorkflowStatus } from './lib/types';
import { allSessionsOf } from './lib/board';
import { folderName, formatRelativeTime, formatTokens } from './lib/format';

type AnyStatus = SessionStatus | AgentStatus | WorkflowStatus;

const STATUS_LABEL: Record<AnyStatus, string> = {
  running: 'rodando', done: 'concluído', waiting: 'aguardando você', your_turn: 'sua vez', stale: 'sem sinal', ended: 'encerrada',
};
const WAITING_REASON_LABEL: Record<string, string> = {
  permission_prompt: 'esperando permissão', idle_prompt: 'ocioso', elicitation_dialog: 'tem uma pergunta para você', agent_needs_input: 'um agente precisa de você',
};

const Badge = ({ status }: { status: AnyStatus }) => <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;

function agentDetail(agent: Agent): string {
  if (agent.status === 'done') return `→ ${agent.result ?? ''}`;
  const lastAction = agent.lastAction ?? 'iniciando…';
  return agent.silentSince ? `${lastAction} · sem nova ação há ${agent.silentSince} min` : lastAction;
}

function AgentView({ agent }: { agent: Agent }) {
  return (
    <>
      <div className="row"><span className="grow">{agent.task ?? agent.label}</span><Badge status={agent.status} /></div>
      <div className="muted grow">{agentDetail(agent)}</div>
      {agent.tokens && <div className="muted">{formatTokens(agent.tokens.primary)} tokens</div>}
    </>
  );
}

function WorkflowView({ workflow }: { workflow: Workflow }) {
  return (
    <>
      <div className="row"><b className="grow">⚙ {workflow.name}</b><Badge status={workflow.status} /></div>
      <div className="tree">
        {workflow.agents.length ? workflow.agents.map((agent) => <AgentView key={agent.id} agent={agent} />) : <div className="muted">aguardando agentes…</div>}
      </div>
    </>
  );
}

function SessionView({ session, now }: { session: Session; now: number }) {
  const reason = session.waitingReason ? WAITING_REASON_LABEL[session.waitingReason] ?? '' : '';
  const hasTree = session.workflows.length > 0 || session.agents.length > 0;
  return (
    <div className="session">
      <div className="row"><span className="grow">{folderName(session.cwd) ?? 'sessão'}</span><Badge status={session.status} /></div>
      <div className="muted">última atividade {formatRelativeTime(session.lastAt, now)}{reason && ` · ${reason}`}</div>
      <div className="muted">{formatTokens(session.tokens.total.primary)} tokens (entrada + saída)</div>
      {hasTree && (
        <div className="tree">
          {session.workflows.map((workflow) => <WorkflowView key={workflow.runId} workflow={workflow} />)}
          {session.agents.map((agent) => <AgentView key={agent.id} agent={agent} />)}
        </div>
      )}
    </div>
  );
}

interface BoardViewProps {
  board: Board;
  now: number;
}

export function BoardView({ board, now }: BoardViewProps) {
  if (board.length === 0) {
    return (
      <div className="notice">
        Nenhuma sessão do Claude Code neste dia.
        <p className="muted">Ainda não conectou? Clique em <b>Conectar meu Claude Code</b> no topo.</p>
      </div>
    );
  }
  return (
    <main>
      {board.map((person) => (
        <section className="card" key={person.login}>
          <h2>{person.login}</h2>
          {allSessionsOf([person]).map((session) => <SessionView key={session.id} session={session} now={now} />)}
        </section>
      ))}
    </main>
  );
}
