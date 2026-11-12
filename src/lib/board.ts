import { emptyTokens, rejectionExcerpt, sessionTokens, summarizeCalls, tokensOfEvent, weekTokens } from './usage';
import { countByDay, isActive } from './activity';
import { clockTime, continuationLabel, dayBounds, dayOptions, effectiveNow, localDay, resumedLabel, startedLabel } from './day';
import { describeAction, formatRelativeTime } from './format';
import type { Agent, AgentEvent, Board, BoardOptions, LooseAgentGroup, Person, Session, SessionStatus, Workflow, WorkflowAgentGroup } from './types';

const MINUTE_MS = 60 * 1000;
// Sem evento por este tempo, a sessão provavelmente foi fechada sem avisar (terminal fechado, queda).
const STALE_AFTER_MS = 10 * MINUTE_MS;
// Com agente ou ferramenta em andamento o silêncio é esperado (build, teste); o limite é maior, mas existe para não deixar sessão fantasma.
const STALE_WITH_WORK_IN_PROGRESS_MS = 120 * MINUTE_MS;
const WAITING_EXPIRES_AFTER_MS = 120 * MINUTE_MS;
const YOUR_TURN_RECENT_MS = 30 * MINUTE_MS;
const AGENT_SILENT_AFTER_MIN = 10;
const WORKFLOW_TASK_START_LENGTH = 60;
const WORKFLOW_LABEL_WORDS = 4;
const WORKFLOW_HIDE_DONE_ABOVE = 6;
const START_MISSING_NOTICE = 'início não guardado';
// Avisos que significam "o trabalho parou até o dev agir"; o idle_prompt é "sua vez" e tem regra própria.
const WAITING_NOTIFICATION_TYPES = new Set(['permission_prompt', 'elicitation_dialog', 'agent_needs_input']);

interface View {
  timeZone: string | undefined;
  today: string;
  day: string;
  now: number;
  dayStartMs: number;
  dayEndMs: number;
  frozen: boolean;
}

interface SessionState {
  status: SessionStatus;
  recent: boolean;
  sinceLabel: string | null;
  statusSince: string;
  waitingReason: string | null;
}

const timeOf = (event: AgentEvent) => Date.parse(event.created_at);
const byTime = (a: AgentEvent, b: AgentEvent) => timeOf(a) - timeOf(b);
const notificationType = (event: AgentEvent) => event.summary?.split(':')[0];
const isWaitingNotification = (event: AgentEvent) => event.event === 'Notification' && WAITING_NOTIFICATION_TYPES.has(notificationType(event) ?? '');
const isIdleNotification = (event: AgentEvent) => event.event === 'Notification' && notificationType(event) === 'idle_prompt';
const isRelevantEvent = (event: AgentEvent) => event.event !== 'Notification' || isWaitingNotification(event) || isIdleNotification(event);
const isToolEvent = (event: AgentEvent) => event.event === 'PreToolUse' || event.event === 'PostToolUse';
// O SessionStart de uma sessão retomada traz "resume" no resumo.
const isResumeStart = (event: AgentEvent) => event.event === 'SessionStart' && event.summary === 'resume';

// Branch do início mais recente que a informou (uma retomada pode abrir em outra branch).
const branchOf = (sessionEvents: AgentEvent[]): string | null => sessionEvents.findLast((event) => event.event === 'SessionStart' && event.branch)?.branch ?? null;

const originOf = (event: AgentEvent) => event.agent_id ?? null;

// Um aviso de espera só sai com evento da mesma origem (agente ou conversa principal), prompt do dev, fim de resposta ou fim da sessão.
const clearsWaiting = (event: AgentEvent, owner: string | null) =>
  ['UserPromptSubmit', 'Stop', 'SessionEnd'].includes(event.event) || originOf(event) === owner;

const DELEGATING_TOOLS = new Set(['Agent', 'Task']);

// Aviso sem agent_id é da única origem com ferramenta em andamento; com zero ou vários candidatos, da conversa principal.
// Quem espera um subagente (Agent/Task) não pede permissão, então não é candidato.
function ownerOfNotice(notice: AgentEvent, toolInFlightByOrigin: Map<string | null, string | null | undefined>): string | null {
  if (notice.agent_id) return notice.agent_id;
  const candidates = [...toolInFlightByOrigin].filter(([, tool]) => !DELEGATING_TOOLS.has(tool ?? '')).map(([origin]) => origin);
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function pendingWaitingOf(events: AgentEvent[]): AgentEvent | null {
  const toolInFlightByOrigin = new Map<string | null, string | null | undefined>();
  let notice: AgentEvent | null = null;
  let owner: string | null = null;
  for (const event of events) {
    if (isWaitingNotification(event)) {
      notice = event;
      owner = ownerOfNotice(event, toolInFlightByOrigin);
    } else if (notice && clearsWaiting(event, owner)) notice = null;
    if (isToolEvent(event)) {
      if (event.event === 'PreToolUse') toolInFlightByOrigin.set(originOf(event), event.tool);
      else toolInFlightByOrigin.delete(originOf(event));
    }
  }
  return notice;
}

// idle_prompt vale como "sua vez" só se nenhum evento de trabalho veio depois (ex.: Esc no meio de uma ferramenta, que não gera Stop)
// e a sessão já teve algum pedido (um SessionStart sozinho não é trabalho).
function pendingIdleOf(events: AgentEvent[]): AgentEvent | null {
  let notice: AgentEvent | null = null;
  let hadWork = false;
  for (const event of events) {
    notice = isIdleNotification(event) && hadWork ? event : null;
    if (!isIdleNotification(event) && event.event !== 'SessionStart') hadWork = true;
  }
  return notice;
}

function hasWorkInProgress(events: AgentEvent[]): boolean {
  const runningAgentIds = new Set<string | null | undefined>();
  let mainToolInFlight = false;
  for (const event of events) {
    if (isToolEvent(event) && !event.agent_id) mainToolInFlight = event.event === 'PreToolUse';
    else if (event.event === 'SubagentStart') runningAgentIds.add(event.agent_id);
    else if (event.event === 'SubagentStop') runningAgentIds.delete(event.agent_id);
  }
  return mainToolInFlight || runningAgentIds.size > 0;
}

function sessionStateAt(events: AgentEvent[], now: number, timeZone: string | undefined): SessionState | null {
  const workEvents = events.filter((event) => !isIdleNotification(event));
  const lastEvent = workEvents.at(-1);
  if (!lastEvent) return null;
  const silentMs = now - timeOf(lastEvent);
  const state = (status: SessionStatus, extra: Partial<SessionState> = {}): SessionState => ({
    status, recent: false, sinceLabel: null, statusSince: lastEvent.created_at, waitingReason: null, ...extra,
  });
  const yourTurnSince = (sinceEvent: AgentEvent) => {
    const recent = now - timeOf(sinceEvent) <= YOUR_TURN_RECENT_MS;
    const sinceLabel = recent ? `terminou ${formatRelativeTime(sinceEvent.created_at, now)}` : `sua vez desde ${clockTime(timeOf(sinceEvent), timeZone)}`;
    return state('your_turn', { recent, sinceLabel, statusSince: sinceEvent.created_at });
  };
  if (lastEvent.event === 'SessionEnd') return state('ended');
  const waitingNotice = pendingWaitingOf(workEvents);
  if (waitingNotice && now - timeOf(waitingNotice) > WAITING_EXPIRES_AFTER_MS) return yourTurnSince(waitingNotice);
  if (lastEvent.event === 'Stop') return yourTurnSince(lastEvent);
  if (waitingNotice) return state('waiting', { statusSince: waitingNotice.created_at, waitingReason: notificationType(waitingNotice) ?? null });
  const idleNotice = pendingIdleOf(events);
  if (idleNotice) return yourTurnSince(idleNotice);
  if (silentMs > (hasWorkInProgress(workEvents) ? STALE_WITH_WORK_IN_PROGRESS_MS : STALE_AFTER_MS)) return state('stale');
  return state('running', silentMs > STALE_AFTER_MS ? { sinceLabel: `rodando ${formatRelativeTime(lastEvent.created_at, now)}` } : {});
}

function silentMinutes(agent: Agent, now: number): number | null {
  if (agent.status !== 'running' || agent.toolInFlight) return null;
  const minutes = Math.floor((now - Date.parse(agent.lastActionAt)) / MINUTE_MS);
  return minutes >= AGENT_SILENT_AFTER_MIN ? minutes : null;
}

function groupBy<T, K>(list: T[], keyOf: (entry: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const entry of list) {
    const key = keyOf(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

const byPrimaryTokensDesc = (a: { tokens: { primary: number } }, b: { tokens: { primary: number } }) => b.tokens.primary - a.tokens.primary;

function groupLooseAgents(agents: Agent[], sessionPrimaryTokens: number): LooseAgentGroup[] {
  return [...groupBy(agents, (agent) => agent.type)]
    .map(([type, calls]) => ({ type, ...summarizeCalls(calls, sessionPrimaryTokens) }))
    .sort(byPrimaryTokensDesc);
}

const startOfTask = (agent: Agent): string | null => agent.task?.slice(0, WORKFLOW_TASK_START_LENGTH) ?? null;

// Só o início idêntico da tarefa indica o mesmo agente; sem tarefa conhecida, cada chamada fica sozinha.
function groupWorkflowAgents(agents: Agent[], sessionPrimaryTokens: number): WorkflowAgentGroup[] {
  return [...groupBy(agents, (agent) => startOfTask(agent) ?? `agent:${agent.id}`).values()]
    .map((calls) => {
      const summary = summarizeCalls(calls, sessionPrimaryTokens);
      const [firstCall] = calls;
      return { startOfTask: firstCall ? startOfTask(firstCall) : null, ...summary, probableSameAgent: summary.callCount > 1 };
    })
    .sort(byPrimaryTokensDesc);
}

function labelOfWorkflowAgent(agent: Agent, position: number): string {
  const taskWords = agent.task?.trim().split(/\s+/).slice(0, WORKFLOW_LABEL_WORDS).join(' ');
  return taskWords || `agente ${position}`;
}

// Sem um SessionStart de início como primeiro evento guardado, o começo da sessão não está no banco.
const isStartMissing = (firstEvent: AgentEvent) => firstEvent.event !== 'SessionStart' || isResumeStart(firstEvent);

function dayMarks(visibleEvents: AgentEvent[], allEvents: AgentEvent[], startedAt: string, startMissing: boolean, view: View) {
  const inDay = visibleEvents.filter((event) => timeOf(event) >= view.dayStartMs);
  const beforeDay = visibleEvents.filter((event) => timeOf(event) < view.dayStartMs);
  const afterDay = allEvents.find((event) => timeOf(event) >= view.dayEndMs);
  const [firstInDay] = inDay;
  const stateBeforeResume = firstInDay && beforeDay.length > 0 ? sessionStateAt(beforeDay, timeOf(firstInDay), view.timeZone)?.status : null;
  const wasIdleBeforeDay = stateBeforeResume === 'your_turn' || stateBeforeResume === 'stale';
  return {
    startedLabel: !startMissing && localDay(Date.parse(startedAt), view.timeZone) < view.day ? startedLabel(Date.parse(startedAt), view.today, view.timeZone) : null,
    continuesAfter: afterDay ? continuationLabel(timeOf(afterDay), view.today, view.timeZone) : null,
    resumedAt: firstInDay && wasIdleBeforeDay ? resumedLabel(timeOf(firstInDay), view.timeZone) : null,
  };
}

function newAgent(event: AgentEvent, agentId: string, task: string | null | undefined, workflow: Workflow | null): Agent {
  return {
    id: agentId,
    type: event.agent_type,
    status: 'running',
    task,
    workflow,
    startedAt: event.created_at,
    lastActionAt: event.created_at,
    toolInFlight: false,
    tokens: null,
    actionAt: [],
    silentSince: null,
    rejectionReason: null,
    label: '',
    lit: false,
  };
}

function newWorkflow(event: AgentEvent): Workflow {
  return {
    runId: event.workflow_run_id,
    name: event.workflow_name,
    status: 'running',
    agents: [],
    agentGroups: [],
    visibleAgents: [],
    hiddenDone: 0,
    hiddenDoneLabel: null,
    actionAt: [],
    lit: false,
  };
}

function buildSession(allEvents: AgentEvent[], view: View): Session | null {
  const eventsInView = view.frozen ? allEvents.filter((event) => timeOf(event) <= view.now) : allEvents;
  const sessionEvents = eventsInView.filter((event) => !isIdleNotification(event));
  const firstEvent = sessionEvents[0];
  const lastEvent = sessionEvents.at(-1);
  if (!firstEvent || !lastEvent) return null;
  const state = sessionStateAt(eventsInView, view.now, view.timeZone);
  if (!state) return null;

  const workflows: Workflow[] = [];
  const agents = new Map<string, Agent>();
  const workflowByRunId = new Map<string, Workflow>();
  const actionTimes: number[] = [];
  let pendingAgentTask: string | null | undefined = null;

  for (const event of sessionEvents) {
    const agentId = event.agent_id;
    const runId = event.workflow_run_id;
    const agent = agentId ? agents.get(agentId) : undefined;
    if (event.event === 'PostToolUse') actionTimes.push(timeOf(event));
    if (event.event === 'PostToolUse' && event.tool === 'Workflow') {
      const workflow = newWorkflow(event);
      workflows.push(workflow);
      if (runId) workflowByRunId.set(runId, workflow);
    } else if (event.event === 'UserPromptSubmit' && runId && workflowByRunId.has(runId)) {
      const workflow = workflowByRunId.get(runId);
      if (workflow) workflow.status = 'done';
    } else if (event.event === 'PreToolUse' && event.tool === 'Agent' && !agentId) {
      pendingAgentTask = event.summary;
    } else if (event.event === 'SubagentStart' && agentId) {
      const isWorkflowAgent = event.agent_type === 'workflow-subagent';
      agents.set(agentId, newAgent(event, agentId, isWorkflowAgent ? null : pendingAgentTask, isWorkflowAgent ? workflows.at(-1) ?? null : null));
      if (!isWorkflowAgent) pendingAgentTask = null;
    } else if (isToolEvent(event) && agent) {
      agent.lastActionAt = event.created_at;
      agent.toolInFlight = event.event === 'PreToolUse';
      if (agent.toolInFlight) agent.lastAction = describeAction(event);
      if (event.event === 'PostToolUse') agent.actionAt.push(timeOf(event));
    } else if (event.event === 'SubagentStop' && agent) {
      Object.assign(agent, { status: 'done', result: event.summary, endedAt: event.created_at, tokens: tokensOfEvent(event) });
      if (event.task) agent.task = event.task;
      // O aviso de término traz o workflow exato; a associação pelo início é só uma estimativa.
      const finishedWorkflow = runId ? workflowByRunId.get(runId) : undefined;
      if (finishedWorkflow) agent.workflow = finishedWorkflow;
    }
  }

  const startMissing = isStartMissing(firstEvent);
  const startedAt = firstEvent.created_at;
  const looseAgents: Agent[] = [];
  for (const agent of agents.values()) {
    if (agent.status === 'running' && (state.status === 'ended' || state.status === 'stale')) agent.status = 'stale';
    agent.silentSince = silentMinutes(agent, view.now);
    agent.rejectionReason = rejectionExcerpt(agent.result);
    agent.lit = !view.frozen && isActive(agent.actionAt, view.now);
    if (agent.workflow) agent.workflow.agents.push(agent);
    else looseAgents.push(agent);
  }
  looseAgents.forEach((agent, index) => { agent.label = agent.type || `agente ${index + 1}`; });

  const sessionUsage = sessionTokens(sessionEvents, { timeZone: view.timeZone, startMissing });
  const tokens = { ...sessionUsage, day: sessionUsage.byDay[view.day] ?? emptyTokens() };

  for (const workflow of workflows) {
    workflow.agents.forEach((agent, index) => { agent.label = labelOfWorkflowAgent(agent, index + 1); });
    workflow.agentGroups = groupWorkflowAgents(workflow.agents, tokens.total.primary);
    const hidesFinishedAgents = workflow.agents.length > WORKFLOW_HIDE_DONE_ABOVE;
    workflow.visibleAgents = workflow.agents.filter((agent) => !(hidesFinishedAgents && agent.status === 'done' && !agent.rejectionReason));
    workflow.hiddenDone = workflow.agents.length - workflow.visibleAgents.length;
    workflow.hiddenDoneLabel = workflow.hiddenDone > 0 ? `${workflow.hiddenDone} ${workflow.hiddenDone === 1 ? 'concluído' : 'concluídos'} · mostrar` : null;
    workflow.actionAt = workflow.agents.flatMap((agent) => agent.actionAt);
    workflow.lit = workflow.agents.some((agent) => agent.lit);
  }

  return {
    id: lastEvent.session_id,
    cwd: lastEvent.cwd ?? sessionEvents.find((event) => event.cwd)?.cwd,
    branch: branchOf(sessionEvents),
    ...state,
    startMissing,
    startMissingNotice: startMissing ? START_MISSING_NOTICE : null,
    startedAt,
    endedAt: lastEvent.event === 'SessionEnd' ? lastEvent.created_at : null,
    ...dayMarks(sessionEvents, allEvents.filter((event) => !isIdleNotification(event)), startedAt, startMissing, view),
    tokens,
    lastAt: lastEvent.created_at,
    workflows,
    agents: looseAgents,
    agentGroups: groupLooseAgents(looseAgents, tokens.total.primary),
    actionAt: actionTimes,
    actionsByDay: countByDay(actionTimes, view.timeZone),
    lit: !view.frozen && isActive(actionTimes, view.now),
  };
}

function createView(now: number, latestEventMs: number, { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, day, connected = true, lastUpdateAt }: BoardOptions): View {
  const today = localDay(now, timeZone);
  const viewedDay = day ?? today;
  const bounds = dayBounds(viewedDay, timeZone);
  const frozen = viewedDay < today || !connected;
  const clock = effectiveNow({ now, day: viewedDay, timeZone, connected, lastUpdateAt });
  return {
    timeZone,
    today,
    day: viewedDay,
    // Ao vivo, o relógio do navegador pode estar atrás do banco: um evento já gravado nunca fica no futuro.
    now: frozen ? clock : Math.max(clock, latestEventMs),
    dayStartMs: Date.parse(bounds.from),
    dayEndMs: Date.parse(bounds.to),
    frozen,
  };
}

type SessionGroup = 'sessions' | 'openIdle' | 'endedToday';

// Sessão encerrada sem atividade no dia some; aberta e parada (sua vez ou sem sinal) vai para o grupo recolhido.
function groupOfSession(session: Session, view: View): SessionGroup | null {
  const hasActivityInDay = Date.parse(session.lastAt) >= view.dayStartMs;
  if (session.status === 'ended') return hasActivityInDay ? 'endedToday' : null;
  const isIdle = session.status === 'your_turn' || session.status === 'stale';
  return !hasActivityInDay && isIdle ? 'openIdle' : 'sessions';
}

const byStartedAt = (a: Session, b: Session) => Date.parse(a.startedAt) - Date.parse(b.startedAt);

function buildPerson(login: string, personEvents: AgentEvent[], view: View): Person {
  const person: Person = { login, sessions: [], openIdle: [], endedToday: [] };
  for (const sessionEvents of groupBy(personEvents, (event) => event.session_id).values()) {
    const session = buildSession(sessionEvents, view);
    const group = session && groupOfSession(session, view);
    if (session && group) person[group].push(session);
  }
  for (const group of ['sessions', 'openIdle', 'endedToday'] as const) person[group].sort(byStartedAt);
  return person;
}

/** Todas as sessões visíveis do board, dos três grupos. */
export const allSessionsOf = (board: Board): Session[] => board.flatMap((person) => [...person.sessions, ...person.openIdle, ...person.endedToday]);

/**
 * Agrupa eventos em pessoas → sessões → workflows/agentes, com o estado de cada um no dia visto.
 * `options`: fuso, dia visto (AAAA-MM-DD), conexão do painel e hora da última atualização.
 */
export function buildBoard(events: AgentEvent[], now: number = Date.now(), options: BoardOptions = {}): Board {
  const ordered = events.filter(isRelevantEvent).sort(byTime);
  const latestEvent = ordered.at(-1);
  const view = createView(now, latestEvent ? timeOf(latestEvent) : 0, options);
  return [...groupBy(ordered, (event) => event.login)]
    .map(([login, personEvents]) => buildPerson(login, personEvents, view))
    .filter((person) => allSessionsOf([person]).length > 0);
}

/** Tokens de cada um dos 7 dias do seletor, somando por evento todas as sessões carregadas (inclusive as que o mapa do dia esconde). */
export function buildWeekTokens(events: AgentEvent[], now: number, timeZone: string | undefined) {
  const ordered = events.filter((event) => isRelevantEvent(event) && !isIdleNotification(event)).sort(byTime);
  const sessions = [...groupBy(ordered, (event) => `${event.login}/${event.session_id}`).values()].map((sessionEvents) => ({
    tokens: sessionTokens(sessionEvents, { timeZone, startMissing: sessionEvents[0] ? isStartMissing(sessionEvents[0]) : false }),
  }));
  return weekTokens(sessions, dayOptions(now, timeZone).map(({ day }) => day));
}
