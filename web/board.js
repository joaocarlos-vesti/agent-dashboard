import { emptyTokens, rejectionExcerpt, sessionTokens, summarizeCalls, tokensOfEvent, weekTokens } from './usage.js';
import { countByDay, isActive } from './activity.js';
import { clockTime, continuationLabel, dayBounds, dayOptions, effectiveNow, localDay, resumedLabel, startedLabel } from './day.js';
import { describeAction, formatRelativeTime } from './format.js';

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
// Avisos que significam "o trabalho parou até o dev agir"; o idle_prompt é "sua vez" e já vem do Stop.
const WAITING_NOTIFICATION_TYPES = new Set(['permission_prompt', 'elicitation_dialog', 'agent_needs_input']);

const timeOf = (event) => Date.parse(event.created_at);
const byTime = (a, b) => timeOf(a) - timeOf(b);
const notificationType = (event) => event.summary?.split(':')[0];
const isWaitingNotification = (event) => event.event === 'Notification' && WAITING_NOTIFICATION_TYPES.has(notificationType(event));
const isRelevantEvent = (event) => event.event !== 'Notification' || isWaitingNotification(event);
const isToolEvent = (event) => event.event === 'PreToolUse' || event.event === 'PostToolUse';
// O SessionStart de uma sessão retomada traz "resume" no resumo.
const isResumeStart = (event) => event.event === 'SessionStart' && event.summary === 'resume';

// Um aviso de espera só sai com evento da mesma origem (agente ou conversa principal), prompt do dev, fim de resposta ou fim da sessão.
const clearsWaiting = (event, notice) =>
  ['UserPromptSubmit', 'Stop', 'SessionEnd'].includes(event.event) || (event.agent_id ?? null) === (notice.agent_id ?? null);

function pendingWaitingOf(events) {
  let notice = null;
  for (const event of events) {
    if (isWaitingNotification(event)) notice = event;
    else if (notice && clearsWaiting(event, notice)) notice = null;
  }
  return notice;
}

function hasWorkInProgress(events) {
  const runningAgentIds = new Set();
  let mainToolInFlight = false;
  for (const event of events) {
    if (isToolEvent(event) && !event.agent_id) mainToolInFlight = event.event === 'PreToolUse';
    else if (event.event === 'SubagentStart') runningAgentIds.add(event.agent_id);
    else if (event.event === 'SubagentStop') runningAgentIds.delete(event.agent_id);
  }
  return mainToolInFlight || runningAgentIds.size > 0;
}

function sessionStateAt(events, now, timeZone) {
  const lastEvent = events.at(-1);
  const lastAt = timeOf(lastEvent);
  const silentMs = now - lastAt;
  const state = (status, extra = {}) => ({ status, recent: false, sinceLabel: null, statusSince: lastEvent.created_at, waitingReason: null, ...extra });
  if (lastEvent.event === 'SessionEnd') return state('ended');
  const waitingNotice = pendingWaitingOf(events);
  const waitingExpired = waitingNotice && silentMs > WAITING_EXPIRES_AFTER_MS;
  if (lastEvent.event === 'Stop' || waitingExpired) {
    const recent = silentMs <= YOUR_TURN_RECENT_MS;
    const sinceLabel = recent ? `terminou ${formatRelativeTime(lastEvent.created_at, now)}` : `sua vez desde ${clockTime(lastAt, timeZone)}`;
    return state('your_turn', { recent, sinceLabel });
  }
  if (waitingNotice) return state('waiting', { statusSince: waitingNotice.created_at, waitingReason: notificationType(waitingNotice) });
  if (silentMs > (hasWorkInProgress(events) ? STALE_WITH_WORK_IN_PROGRESS_MS : STALE_AFTER_MS)) return state('stale');
  return state('running', silentMs > STALE_AFTER_MS ? { sinceLabel: `rodando ${formatRelativeTime(lastEvent.created_at, now)}` } : {});
}

function silentMinutes(agent, now) {
  if (agent.status !== 'running' || agent.toolInFlight) return null;
  const minutes = Math.floor((now - Date.parse(agent.lastActionAt)) / MINUTE_MS);
  return minutes >= AGENT_SILENT_AFTER_MIN ? minutes : null;
}

const byPrimaryTokensDesc = (a, b) => b.tokens.primary - a.tokens.primary;

function groupLooseAgents(agents, sessionPrimaryTokens) {
  return [...groupBy(agents, (agent) => agent.type)]
    .map(([type, calls]) => ({ type, ...summarizeCalls(calls, sessionPrimaryTokens) }))
    .sort(byPrimaryTokensDesc);
}

// Só o início idêntico da tarefa indica o mesmo agente; sem tarefa conhecida, cada chamada fica sozinha.
function groupWorkflowAgents(agents, sessionPrimaryTokens) {
  const startOfTask = (agent) => agent.task?.slice(0, WORKFLOW_TASK_START_LENGTH) ?? null;
  return [...groupBy(agents, (agent) => startOfTask(agent) ?? `agent:${agent.id}`)]
    .map(([, calls]) => {
      const summary = summarizeCalls(calls, sessionPrimaryTokens);
      return { startOfTask: startOfTask(calls[0]), ...summary, probableSameAgent: summary.callCount > 1 };
    })
    .sort(byPrimaryTokensDesc);
}

const groupBy = (list, keyOf) =>
  list.reduce((groups, entry) => groups.set(keyOf(entry), [...(groups.get(keyOf(entry)) ?? []), entry]), new Map());

function labelOfWorkflowAgent(agent, position) {
  const taskWords = agent.task?.trim().split(/\s+/).slice(0, WORKFLOW_LABEL_WORDS).join(' ');
  return taskWords || `agente ${position}`;
}

// Sem um SessionStart de início como primeiro evento guardado, o começo da sessão não está no banco.
const isStartMissing = (firstEvent) => firstEvent.event !== 'SessionStart' || isResumeStart(firstEvent);

function dayMarks(visibleEvents, allEvents, startedAt, startMissing, view) {
  const inDay = visibleEvents.filter((event) => timeOf(event) >= view.dayStartMs);
  const beforeDay = visibleEvents.filter((event) => timeOf(event) < view.dayStartMs);
  const afterDay = allEvents.find((event) => timeOf(event) >= view.dayEndMs);
  const stateBeforeResume = inDay.length > 0 && beforeDay.length > 0 ? sessionStateAt(beforeDay, timeOf(inDay[0]), view.timeZone).status : null;
  const wasIdleBeforeDay = stateBeforeResume === 'your_turn' || stateBeforeResume === 'stale';
  return {
    startedLabel: !startMissing && localDay(Date.parse(startedAt), view.timeZone) < view.day ? startedLabel(Date.parse(startedAt), view.today, view.timeZone) : null,
    continuesAfter: afterDay ? continuationLabel(timeOf(afterDay), view.today, view.timeZone) : null,
    resumedAt: wasIdleBeforeDay ? resumedLabel(timeOf(inDay[0]), view.timeZone) : null,
  };
}

function buildSession(allEvents, view) {
  const sessionEvents = view.frozen ? allEvents.filter((event) => timeOf(event) <= view.now) : allEvents;
  if (sessionEvents.length === 0) return null;
  const workflows = [];
  const agents = new Map();
  const workflowByRunId = new Map();
  const actionTimes = [];
  let pendingAgentTask = null;

  for (const event of sessionEvents) {
    if (event.event === 'PostToolUse') actionTimes.push(timeOf(event));
    if (event.event === 'PostToolUse' && event.tool === 'Workflow') {
      const workflow = { runId: event.workflow_run_id, name: event.workflow_name, status: 'running', agents: [] };
      workflows.push(workflow);
      workflowByRunId.set(workflow.runId, workflow);
    } else if (event.event === 'UserPromptSubmit' && workflowByRunId.has(event.workflow_run_id)) {
      workflowByRunId.get(event.workflow_run_id).status = 'done';
    } else if (event.event === 'PreToolUse' && event.tool === 'Agent' && !event.agent_id) {
      pendingAgentTask = event.summary;
    } else if (event.event === 'SubagentStart') {
      const isWorkflowAgent = event.agent_type === 'workflow-subagent';
      agents.set(event.agent_id, {
        id: event.agent_id,
        type: event.agent_type,
        status: 'running',
        task: isWorkflowAgent ? null : pendingAgentTask,
        workflow: isWorkflowAgent ? workflows.at(-1) : null,
        startedAt: event.created_at,
        lastActionAt: event.created_at,
        toolInFlight: false,
        tokens: null,
        actionAt: [],
      });
      if (!isWorkflowAgent) pendingAgentTask = null;
    } else if (isToolEvent(event) && agents.has(event.agent_id)) {
      const agent = agents.get(event.agent_id);
      agent.lastActionAt = event.created_at;
      agent.toolInFlight = event.event === 'PreToolUse';
      if (agent.toolInFlight) agent.lastAction = describeAction(event);
      if (event.event === 'PostToolUse') agent.actionAt.push(timeOf(event));
    } else if (event.event === 'SubagentStop' && agents.has(event.agent_id)) {
      const agent = agents.get(event.agent_id);
      Object.assign(agent, { status: 'done', result: event.summary, endedAt: event.created_at, tokens: tokensOfEvent(event) });
      if (event.task) agent.task = event.task;
      // O aviso de término traz o workflow exato; a associação pelo início é só uma estimativa.
      if (workflowByRunId.has(event.workflow_run_id)) agent.workflow = workflowByRunId.get(event.workflow_run_id);
    }
  }

  const lastEvent = sessionEvents.at(-1);
  const state = sessionStateAt(sessionEvents, view.now, view.timeZone);
  const startMissing = isStartMissing(sessionEvents[0]);
  const startedAt = sessionEvents[0].created_at;
  const looseAgents = [];
  for (const agent of agents.values()) {
    if (agent.status === 'running' && (state.status === 'ended' || state.status === 'stale')) agent.status = 'stale';
    agent.silentSince = silentMinutes(agent, view.now);
    agent.rejectionReason = rejectionExcerpt(agent.result);
    agent.lit = !view.frozen && isActive(agent.actionAt, view.now);
    if (agent.workflow) agent.workflow.agents.push(agent);
    else looseAgents.push(agent);
  }
  looseAgents.forEach((agent, index) => { agent.label = agent.type || `agente ${index + 1}`; });

  const tokens = sessionTokens(sessionEvents, { timeZone: view.timeZone, startMissing });
  tokens.day = tokens.byDay[view.day] ?? emptyTokens();

  for (const workflow of workflows) {
    workflow.agents.forEach((agent, index) => { agent.label = labelOfWorkflowAgent(agent, index + 1); });
    workflow.agentGroups = groupWorkflowAgents(workflow.agents, tokens.total.primary);
    const collapsible = workflow.agents.length > WORKFLOW_HIDE_DONE_ABOVE ? (agent) => agent.status === 'done' && !agent.rejectionReason : () => false;
    workflow.visibleAgents = workflow.agents.filter((agent) => !collapsible(agent));
    workflow.hiddenDone = workflow.agents.length - workflow.visibleAgents.length;
    workflow.hiddenDoneLabel = workflow.hiddenDone > 0 ? `${workflow.hiddenDone} ${workflow.hiddenDone === 1 ? 'concluído' : 'concluídos'} · mostrar` : null;
    workflow.actionAt = workflow.agents.flatMap((agent) => agent.actionAt);
    workflow.lit = workflow.agents.some((agent) => agent.lit);
  }

  return {
    id: lastEvent.session_id,
    cwd: lastEvent.cwd ?? sessionEvents.find((event) => event.cwd)?.cwd,
    ...state,
    startMissing,
    startMissingNotice: startMissing ? START_MISSING_NOTICE : null,
    startedAt,
    endedAt: lastEvent.event === 'SessionEnd' ? lastEvent.created_at : null,
    ...dayMarks(sessionEvents, allEvents, startedAt, startMissing, view),
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

function createView(now, latestEventMs, { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, day, connected = true, lastUpdateAt } = {}) {
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

// Sessão encerrada sem atividade no dia some; aberta e parada (sua vez ou sem sinal) vai para o grupo recolhido.
function groupOfSession(session, view) {
  const hasActivityInDay = Date.parse(session.lastAt) >= view.dayStartMs;
  if (session.status === 'ended') return hasActivityInDay ? 'endedToday' : null;
  const isIdle = session.status === 'your_turn' || session.status === 'stale';
  return !hasActivityInDay && isIdle ? 'openIdle' : 'sessions';
}

const byStartedAt = (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt);

function buildPerson(login, personEvents, view) {
  const person = { login, sessions: [], openIdle: [], endedToday: [] };
  for (const sessionEvents of groupBy(personEvents, (event) => event.session_id).values()) {
    const session = buildSession(sessionEvents, view);
    const group = session && groupOfSession(session, view);
    if (group) person[group].push(session);
  }
  for (const group of ['sessions', 'openIdle', 'endedToday']) person[group].sort(byStartedAt);
  return person;
}

/** Todas as sessões visíveis do board, dos três grupos. */
export const allSessionsOf = (board) => board.flatMap((person) => [...person.sessions, ...person.openIdle, ...person.endedToday]);

/**
 * Agrupa eventos em pessoas → sessões → workflows/agentes, com o estado de cada um no dia visto.
 * `options`: fuso, dia visto (AAAA-MM-DD), conexão do painel e hora da última atualização.
 */
export function buildBoard(events, now = Date.now(), options = {}) {
  const ordered = events.filter(isRelevantEvent).sort(byTime);
  const view = createView(now, ordered.length ? timeOf(ordered.at(-1)) : 0, options);
  return [...groupBy(ordered, (event) => event.login)]
    .map(([login, personEvents]) => buildPerson(login, personEvents, view))
    .filter((person) => allSessionsOf([person]).length > 0);
}

/** Tokens de cada um dos 7 dias do seletor, somando por evento todas as sessões carregadas (inclusive as que o mapa do dia esconde). */
export function buildWeekTokens(events, now, timeZone) {
  const ordered = events.filter(isRelevantEvent).sort(byTime);
  const sessions = [...groupBy(ordered, (event) => `${event.login}/${event.session_id}`).values()]
    .map((sessionEvents) => ({ tokens: sessionTokens(sessionEvents, { timeZone, startMissing: isStartMissing(sessionEvents[0]) }) }));
  return weekTokens(sessions, dayOptions(now, timeZone).map(({ day }) => day));
}
