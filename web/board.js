import { addTokens, conversationUsage, emptyTokens, rejectionExcerpt, summarizeCalls, tokensOfEvent } from './usage.js';
import { countByDay, isActive } from './activity.js';
import { continuationLabel, dayBounds, daysBetween, effectiveNow, localDay, clockTime, resumedLabel, startedLabel } from './day.js';
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
// Eventos com mais de 7 dias são apagados: primeiro evento guardado sem SessionStart e tão antigo indica início apagado.
const START_MISSING_AFTER_DAYS = 6;
// Só estes avisos significam "o trabalho parou até o dev agir"; o idle_prompt é "sua vez" e já vem do Stop.
const WAITING_NOTIFICATION_TYPES = new Set(['permission_prompt', 'elicitation_dialog']);

const timeOf = (event) => Date.parse(event.created_at);
const byTime = (a, b) => timeOf(a) - timeOf(b);
const notificationType = (event) => event.summary?.split(':')[0];
const isWaitingNotification = (event) => event.event === 'Notification' && WAITING_NOTIFICATION_TYPES.has(notificationType(event));
const isRelevantEvent = (event) => event.event !== 'Notification' || isWaitingNotification(event);
const isToolEvent = (event) => event.event === 'PreToolUse' || event.event === 'PostToolUse';
// O SessionStart de uma sessão retomada traz "resume" no resumo.
const isResumeStart = (event) => event.event === 'SessionStart' && event.summary === 'resume';

function sessionState(lastEvent, now, hasWorkInProgress, timeZone) {
  const lastAt = timeOf(lastEvent);
  const silentMs = now - lastAt;
  const state = (status, extra = {}) => ({ status, recent: false, sinceLabel: null, ...extra });
  if (lastEvent.event === 'SessionEnd') return state('ended');
  const waitingExpired = isWaitingNotification(lastEvent) && silentMs > WAITING_EXPIRES_AFTER_MS;
  if (lastEvent.event === 'Stop' || waitingExpired) {
    const recent = silentMs <= YOUR_TURN_RECENT_MS;
    const sinceLabel = recent ? `terminou ${formatRelativeTime(lastEvent.created_at, now)}` : `sua vez desde ${clockTime(lastAt, timeZone)}`;
    return state('your_turn', { recent, sinceLabel });
  }
  if (isWaitingNotification(lastEvent)) return state('waiting');
  if (silentMs > (hasWorkInProgress ? STALE_WITH_WORK_IN_PROGRESS_MS : STALE_AFTER_MS)) return state('stale');
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

function startState(sessionEvents, today, timeZone) {
  const [firstEvent] = sessionEvents;
  const startMissing = isResumeStart(firstEvent) || (firstEvent.event !== 'SessionStart' && daysBetween(localDay(timeOf(firstEvent), timeZone), today) >= START_MISSING_AFTER_DAYS);
  return { startMissing, startedAt: firstEvent.created_at };
}

function dayMarks(visibleEvents, allEvents, startedAt, startMissing, view) {
  const inDay = visibleEvents.filter((event) => timeOf(event) >= view.dayStartMs);
  const beforeDay = visibleEvents.filter((event) => timeOf(event) < view.dayStartMs);
  const afterDay = allEvents.find((event) => timeOf(event) >= view.dayEndMs);
  const wasIdleBeforeDay = inDay.length > 0 && beforeDay.length > 0 && timeOf(inDay[0]) - timeOf(beforeDay.at(-1)) > STALE_AFTER_MS;
  return {
    startedLabel: !startMissing && localDay(Date.parse(startedAt), view.timeZone) < view.day ? startedLabel(Date.parse(startedAt), view.today, view.timeZone) : null,
    continuesAfter: afterDay ? continuationLabel(timeOf(afterDay), view.today, view.timeZone) : null,
    resumedAt: wasIdleBeforeDay ? resumedLabel(timeOf(inDay[0]), view.timeZone) : null,
  };
}

function buildSession(allEvents, view) {
  const sessionEvents = allEvents.filter((event) => timeOf(event) <= view.now);
  if (sessionEvents.length === 0) return null;
  const workflows = [];
  const agents = new Map();
  const workflowByRunId = new Map();
  const actionTimes = [];
  let pendingAgentTask = null;
  let mainToolInFlight = false;

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
    if (isToolEvent(event) && !event.agent_id) mainToolInFlight = event.event === 'PreToolUse';
  }

  const lastEvent = sessionEvents.at(-1);
  const hasRunningAgent = [...agents.values()].some((agent) => agent.status === 'running');
  const state = sessionState(lastEvent, view.now, mainToolInFlight || hasRunningAgent, view.timeZone);
  const { startMissing, startedAt } = startState(sessionEvents, view.today, view.timeZone);
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

  const conversation = conversationUsage(sessionEvents, { timeZone: view.timeZone, startMissing });
  const byDay = { ...conversation.byDay };
  for (const agent of agents.values()) {
    if (agent.tokens) {
      const day = localDay(Date.parse(agent.endedAt), view.timeZone);
      byDay[day] = addTokens([byDay[day], agent.tokens]);
    }
  }
  const tokens = { conversation: conversation.total, agents: addTokens([...agents.values()].map((agent) => agent.tokens)), byDay };
  tokens.total = addTokens([tokens.conversation, tokens.agents]);
  tokens.day = byDay[view.day] ?? emptyTokens();

  for (const workflow of workflows) {
    workflow.agents.forEach((agent, index) => { agent.label = labelOfWorkflowAgent(agent, index + 1); });
    workflow.agentGroups = groupWorkflowAgents(workflow.agents, tokens.total.primary);
    const collapsible = workflow.agents.length > WORKFLOW_HIDE_DONE_ABOVE ? (agent) => agent.status === 'done' && !agent.rejectionReason : () => false;
    workflow.visibleAgents = workflow.agents.filter((agent) => !collapsible(agent));
    workflow.hiddenDone = workflow.agents.length - workflow.visibleAgents.length;
    workflow.actionAt = workflow.agents.flatMap((agent) => agent.actionAt);
    workflow.lit = workflow.agents.some((agent) => agent.lit);
  }

  return {
    id: lastEvent.session_id,
    cwd: lastEvent.cwd ?? sessionEvents.find((event) => event.cwd)?.cwd,
    ...state,
    statusSince: lastEvent.created_at,
    waitingReason: state.status === 'waiting' ? notificationType(lastEvent) : null,
    startMissing,
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

function createView(now, { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, day, connected = true, lastUpdateAt } = {}) {
  const today = localDay(now, timeZone);
  const viewedDay = day ?? today;
  const bounds = dayBounds(viewedDay, timeZone);
  return {
    timeZone,
    today,
    day: viewedDay,
    now: effectiveNow({ now, day: viewedDay, timeZone, connected, lastUpdateAt }),
    dayStartMs: Date.parse(bounds.from),
    dayEndMs: Date.parse(bounds.to),
    frozen: viewedDay < today || !connected,
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
  const view = createView(now, options);
  const ordered = events.filter(isRelevantEvent).sort(byTime);
  return [...groupBy(ordered, (event) => event.login)]
    .map(([login, personEvents]) => buildPerson(login, personEvents, view))
    .filter((person) => allSessionsOf([person]).length > 0);
}
