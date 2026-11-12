// Sem evento por este tempo, a sessão provavelmente foi fechada sem avisar (terminal fechado, queda).
const STALE_AFTER_MS = 10 * 60 * 1000;

const describeAction = (event) => [event.tool, event.summary].filter(Boolean).join(': ');

function sessionStatus(lastEvent, now) {
  if (lastEvent.event === 'SessionEnd') return 'ended';
  if (lastEvent.event === 'Stop') return 'idle';
  if (now - Date.parse(lastEvent.created_at) > STALE_AFTER_MS) return 'stale';
  return 'running';
}

function buildSession(sessionEvents, now) {
  const workflows = [];
  const agents = new Map();
  const workflowByRunId = new Map();
  let pendingAgentTask = null;

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
      });
      if (!isWorkflowAgent) pendingAgentTask = null;
    } else if (event.event === 'PreToolUse' && agents.has(event.agent_id)) {
      agents.get(event.agent_id).lastAction = describeAction(event);
    } else if (event.event === 'SubagentStop' && agents.has(event.agent_id)) {
      const agent = agents.get(event.agent_id);
      Object.assign(agent, { status: 'done', result: event.summary, endedAt: event.created_at });
      if (event.task) agent.task = event.task;
      // O aviso de término traz o workflow exato; a associação pelo início é só uma estimativa.
      if (workflowByRunId.has(event.workflow_run_id)) agent.workflow = workflowByRunId.get(event.workflow_run_id);
    }
  }

  const lastEvent = sessionEvents.at(-1);
  const status = sessionStatus(lastEvent, now);
  const looseAgents = [];
  for (const agent of agents.values()) {
    if (agent.status === 'running' && (status === 'ended' || status === 'stale')) agent.status = 'stale';
    if (agent.workflow) agent.workflow.agents.push(agent);
    else looseAgents.push(agent);
  }

  return {
    id: lastEvent.session_id,
    cwd: lastEvent.cwd ?? sessionEvents.find((event) => event.cwd)?.cwd,
    status,
    lastAt: lastEvent.created_at,
    workflows,
    agents: looseAgents,
  };
}

const groupBy = (list, keyOf) =>
  list.reduce((groups, entry) => groups.set(keyOf(entry), [...(groups.get(keyOf(entry)) ?? []), entry]), new Map());

/** Agrupa eventos em pessoas → sessões → workflows/agentes, com o status atual de cada um. */
export function buildBoard(events, now = Date.now()) {
  const ordered = [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return [...groupBy(ordered, (event) => event.login)].map(([login, personEvents]) => ({
    login,
    sessions: [...groupBy(personEvents, (event) => event.session_id).values()]
      .map((sessionEvents) => buildSession(sessionEvents, now))
      .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)),
  }));
}
