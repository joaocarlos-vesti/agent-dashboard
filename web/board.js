import { addTokens, summarizeCalls, tokensOfEvent } from './usage.js';

const MINUTE_MS = 60 * 1000;
// Sem evento por este tempo, a sessão provavelmente foi fechada sem avisar (terminal fechado, queda).
const STALE_AFTER_MS = 10 * MINUTE_MS;
// Com agente ou ferramenta em andamento o silêncio é esperado (build, teste); o limite é maior, mas existe para não deixar sessão fantasma.
const STALE_WITH_WORK_IN_PROGRESS_MS = 120 * MINUTE_MS;
const AGENT_SILENT_AFTER_MIN = 10;
const WORKFLOW_TASK_START_LENGTH = 60;
// Avisos do Claude Code que significam "o trabalho parou até o dev agir"; os demais não mudam o estado.
const WAITING_NOTIFICATION_TYPES = new Set(['permission_prompt', 'idle_prompt', 'elicitation_dialog', 'agent_needs_input']);

const describeAction = (event) => [event.tool, event.summary].filter(Boolean).join(': ');

const notificationType = (event) => event.summary?.split(':')[0];
const isWaitingNotification = (event) => event.event === 'Notification' && WAITING_NOTIFICATION_TYPES.has(notificationType(event));
const isRelevantEvent = (event) => event.event !== 'Notification' || isWaitingNotification(event);
const isToolEvent = (event) => event.event === 'PreToolUse' || event.event === 'PostToolUse';

function sessionStatus(lastEvent, now, hasWorkInProgress) {
  if (lastEvent.event === 'SessionEnd') return 'ended';
  if (lastEvent.event === 'Stop' || lastEvent.event === 'Notification') return 'idle';
  const staleAfterMs = hasWorkInProgress ? STALE_WITH_WORK_IN_PROGRESS_MS : STALE_AFTER_MS;
  if (now - Date.parse(lastEvent.created_at) > staleAfterMs) return 'stale';
  return 'running';
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

function buildSession(sessionEvents, now) {
  const workflows = [];
  const agents = new Map();
  const workflowByRunId = new Map();
  let pendingAgentTask = null;
  let conversationTokens = null;
  let mainToolInFlight = false;

  for (const event of sessionEvents) {
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
      });
      if (!isWorkflowAgent) pendingAgentTask = null;
    } else if (isToolEvent(event) && agents.has(event.agent_id)) {
      const agent = agents.get(event.agent_id);
      agent.lastActionAt = event.created_at;
      agent.toolInFlight = event.event === 'PreToolUse';
      if (agent.toolInFlight) agent.lastAction = describeAction(event);
    } else if (event.event === 'SubagentStop' && agents.has(event.agent_id)) {
      const agent = agents.get(event.agent_id);
      Object.assign(agent, { status: 'done', result: event.summary, endedAt: event.created_at, tokens: tokensOfEvent(event) });
      if (event.task) agent.task = event.task;
      // O aviso de término traz o workflow exato; a associação pelo início é só uma estimativa.
      if (workflowByRunId.has(event.workflow_run_id)) agent.workflow = workflowByRunId.get(event.workflow_run_id);
    }
    if (event.event === 'Stop') conversationTokens = tokensOfEvent(event);
    if (isToolEvent(event) && !event.agent_id) mainToolInFlight = event.event === 'PreToolUse';
  }

  const lastEvent = sessionEvents.at(-1);
  const hasRunningAgent = [...agents.values()].some((agent) => agent.status === 'running');
  const status = sessionStatus(lastEvent, now, mainToolInFlight || hasRunningAgent);
  const looseAgents = [];
  for (const agent of agents.values()) {
    if (agent.status === 'running' && (status === 'ended' || status === 'stale')) agent.status = 'stale';
    agent.silentSince = silentMinutes(agent, now);
    if (agent.workflow) agent.workflow.agents.push(agent);
    else looseAgents.push(agent);
  }

  const tokens = {
    conversation: addTokens([conversationTokens]),
    agents: addTokens([...agents.values()].map((agent) => agent.tokens)),
  };
  tokens.total = addTokens([tokens.conversation, tokens.agents]);
  for (const workflow of workflows) workflow.agentGroups = groupWorkflowAgents(workflow.agents, tokens.total.primary);

  return {
    id: lastEvent.session_id,
    cwd: lastEvent.cwd ?? sessionEvents.find((event) => event.cwd)?.cwd,
    status,
    waitingReason: lastEvent.event === 'Notification' ? notificationType(lastEvent) : null,
    tokens,
    lastAt: lastEvent.created_at,
    workflows,
    agents: looseAgents,
    agentGroups: groupLooseAgents(looseAgents, tokens.total.primary),
  };
}

const groupBy = (list, keyOf) =>
  list.reduce((groups, entry) => groups.set(keyOf(entry), [...(groups.get(keyOf(entry)) ?? []), entry]), new Map());

/** Agrupa eventos em pessoas → sessões → workflows/agentes, com o status atual de cada um. */
export function buildBoard(events, now = Date.now()) {
  const ordered = events.filter(isRelevantEvent).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return [...groupBy(ordered, (event) => event.login)].map(([login, personEvents]) => ({
    login,
    sessions: [...groupBy(personEvents, (event) => event.session_id).values()]
      .map((sessionEvents) => buildSession(sessionEvents, now))
      .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)),
  }));
}
