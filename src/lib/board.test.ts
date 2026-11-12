import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildBoard, allSessionsOf, buildWeekTokens } from './board';
import type { AgentEvent, Board, BoardOptions, Session } from './types';
import { attentionItems } from './attention';
import { gaugeSummary, lineState } from './activity';
import { tabIndicator } from './format';

const UTC = 'UTC';
const SP = 'America/Sao_Paulo';
const NOW = Date.parse('2026-11-12T12:00:00Z');
type EventExtra = Partial<AgentEvent>;
const at = (minAgo: number) => new Date(NOW - minAgo * 60000).toISOString();
const ev = (minAgo: number, event: string, extra: EventExtra = {}): AgentEvent => ({ login: 'joao', session_id: 's1', event, created_at: at(minAgo), ...extra });
const evAt = (isoTime: string, event: string, extra: EventExtra = {}): AgentEvent => ({ login: 'joao', session_id: 's1', event, created_at: isoTime, ...extra });
const evSecondsAgo = (seconds: number, event: string, extra: EventExtra = {}): AgentEvent => ({ login: 'joao', session_id: 's1', event, created_at: new Date(NOW - seconds * 1000).toISOString(), ...extra });
const boardOf = (events: AgentEvent[], now = NOW, options: BoardOptions = {}) => buildBoard(events, now, { timeZone: UTC, ...options });
function firstSession(events: AgentEvent[], now?: number, options?: BoardOptions): Session {
  const [session] = allSessionsOf(boardOf(events, now, options));
  if (!session) throw new Error('nenhuma sessão no board');
  return session;
}
const mapSessionsOf = (board: Board) => board.flatMap((person) => person.sessions);

test('sessão com evento recente e sem Stop está rodando', () => {
  assert.equal(firstSession([ev(1, 'SessionStart'), ev(0, 'PreToolUse', { tool: 'Bash' })]).status, 'running');
});

test('aguardando só com pedido de permissão', () => {
  const session = firstSession([ev(2, 'PreToolUse', { tool: 'Bash' }), ev(1, 'Notification', { summary: 'permission_prompt: Claude needs your permission to use Bash' })]);
  assert.deepEqual([session.status, session.waitingReason], ['waiting', 'permission_prompt']);
});

test('pergunta direta ao dev também deixa a sessão aguardando', () => {
  const session = firstSession([ev(2, 'SessionStart'), ev(1, 'Notification', { summary: 'elicitation_dialog: Claude has a question' })]);
  assert.equal(session.status, 'waiting');
});

test('pergunta de agente ao dev deixa a sessão aguardando', () => {
  const session = firstSession([ev(2, 'PreToolUse', { tool: 'Bash' }), ev(1, 'Notification', { summary: 'agent_needs_input: um agente precisa de você' })]);
  assert.deepEqual([session.status, session.waitingReason], ['waiting', 'agent_needs_input']);
});

const permissionNotice = (minAgo: number, extra: EventExtra = {}) => ev(minAgo, 'Notification', { summary: 'permission_prompt: x', ...extra });
const siblingAction = (minAgo: number, agentId: string) => ev(minAgo, 'PostToolUse', { agent_id: agentId, tool: 'Read' });

test('evento de agente irmão não limpa o aguardando da conversa principal', () => {
  const session = firstSession([permissionNotice(3), siblingAction(2, 'a2'), siblingAction(1, 'a3')]);
  assert.deepEqual([session.status, session.statusSince], ['waiting', at(3)]);
});

test('evento da conversa principal limpa o aguardando', () => {
  assert.equal(firstSession([permissionNotice(3), siblingAction(2, 'a2'), ev(1, 'PostToolUse', { tool: 'Bash' })]).status, 'running');
});

test('aviso de um agente só sai com evento do mesmo agente', () => {
  const fromA1 = permissionNotice(3, { agent_id: 'a1' });
  assert.equal(firstSession([fromA1, siblingAction(2, 'a2')]).status, 'waiting');
  assert.equal(firstSession([fromA1, siblingAction(1, 'a1')]).status, 'running');
});

test('prompt do dev limpa o aguardando de qualquer origem', () => {
  assert.equal(firstSession([permissionNotice(3, { agent_id: 'a1' }), ev(1, 'UserPromptSubmit')]).status, 'running');
});

test('evento de agente sem aviso novo não vira aguardando', () => {
  assert.equal(firstSession([ev(3, 'PreToolUse', { tool: 'Bash' }), siblingAction(1, 'a2')]).status, 'running');
});

test('aviso que não é permissão não muda o estado', () => {
  const session = firstSession([ev(40, 'SessionStart'), ev(40, 'Stop'), ev(35, 'Notification', { summary: 'idle_prompt: Claude is waiting for your input' })]);
  assert.deepEqual([session.status, session.sinceLabel], ['your_turn', 'sua vez desde 11:20']);
});

test('aviso de login não muda a sessão', () => {
  const session = firstSession([ev(2, 'PreToolUse', { tool: 'Bash' }), ev(1, 'Notification', { summary: 'auth_success: Logged in' })]);
  assert.deepEqual([session.status, session.lastAt], ['running', at(2)]);
});

test('Stop deixa a sessão na sua vez', () => {
  const session = firstSession([ev(2, 'SessionStart'), ev(1, 'Stop')]);
  assert.deepEqual([session.status, session.waitingReason], ['your_turn', null]);
});

test('aguardando há 2 h vira sua vez', () => {
  const events = [evAt('2026-11-12T10:00:00Z', 'Notification', { summary: 'permission_prompt: x' })];
  assert.equal(firstSession(events, Date.parse('2026-11-12T12:00:01Z')).status, 'your_turn');
  assert.equal(firstSession(events, Date.parse('2026-11-12T11:59:00Z')).status, 'waiting');
});

test('sua vez recente tem destaque', () => {
  const session = firstSession([ev(30, 'SessionStart'), ev(29, 'Stop')]);
  assert.deepEqual([session.status, session.recent, session.sinceLabel], ['your_turn', true, 'terminou há 29 min']);
});

test('sua vez antiga perde o destaque', () => {
  const session = firstSession([ev(60, 'SessionStart'), ev(40, 'Stop')]);
  assert.deepEqual([session.recent, session.sinceLabel], [false, 'sua vez desde 11:20']);
  assert.equal(firstSession([ev(60, 'SessionStart'), ev(31, 'Stop')]).recent, false);
});

test('sessão rodando sem evento há mais de 10 minutos fica sem sinal', () => {
  const stale = firstSession([ev(15, 'SessionStart'), evSecondsAgo(601, 'PostToolUse', { tool: 'Bash' })]);
  const running = firstSession([ev(15, 'SessionStart'), evSecondsAgo(599, 'PostToolUse', { tool: 'Bash' })]);
  assert.deepEqual([stale.status, running.status], ['stale', 'running']);
});

test('ferramenta em andamento só fica sem sinal depois de 2 horas', () => {
  const longTool = firstSession([ev(70, 'SessionStart'), ev(60, 'PreToolUse', { tool: 'Bash' })]);
  assert.deepEqual([longTool.status, longTool.sinceLabel], ['running', 'rodando há 1 h']);
  assert.equal(firstSession([ev(200, 'SessionStart'), evSecondsAgo(7199, 'PreToolUse', { tool: 'Bash' })]).status, 'running');
  assert.equal(firstSession([ev(200, 'SessionStart'), evSecondsAgo(7201, 'PreToolUse', { tool: 'Bash' })]).status, 'stale');
});

test('sessão com SessionEnd está encerrada', () => {
  assert.equal(firstSession([ev(2, 'SessionStart'), ev(1, 'SessionEnd')]).status, 'ended');
});

test('evento novo tira a sessão de sua vez e de aguardando', () => {
  assert.equal(firstSession([ev(3, 'Stop'), ev(1, 'PreToolUse', { tool: 'Bash' })]).status, 'running');
  const afterPermission = firstSession([ev(2, 'Notification', { summary: 'permission_prompt: x' }), ev(1, 'PostToolUse', { tool: 'Bash' })]);
  assert.deepEqual([afterPermission.status, afterPermission.waitingReason], ['running', null]);
});

test('agente de workflow entra no workflow mais recente da sessão e termina com o resultado', () => {
  const session = firstSession([
    ev(5, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    ev(4, 'SubagentStart', { agent_id: 'a1', agent_type: 'workflow-subagent' }),
    ev(3, 'PreToolUse', { agent_id: 'a1', tool: 'Read', summary: 'spec.md' }),
    ev(2, 'SubagentStop', { agent_id: 'a1', workflow_run_id: 'wf_1', summary: 'APROVADO', task: 'Revise a fase 2' }),
  ]);
  const [agent] = session.workflows[0].agents;
  assert.deepEqual([agent.status, agent.result, agent.task], ['done', 'APROVADO', 'Revise a fase 2']);
});

test('agente rodando mostra a última ação em verbo', () => {
  const session = firstSession([
    ev(3, 'PreToolUse', { tool: 'Agent', summary: 'Revisar lógica' }),
    ev(2, 'SubagentStart', { agent_id: 'a1', agent_type: 'general-purpose' }),
    ev(1, 'PreToolUse', { agent_id: 'a1', tool: 'Bash', summary: 'npm test' }),
  ]);
  const [agent] = session.agents;
  assert.deepEqual([agent.status, agent.task, agent.lastAction], ['running', 'Revisar lógica', 'rodou npm test']);
});

test('agente termina como concluído', () => {
  const session = firstSession([ev(5, 'SubagentStart', { agent_id: 'a1', agent_type: 'general-purpose' }), ev(4, 'SubagentStop', { agent_id: 'a1', summary: 'ok' })]);
  assert.equal(session.agents[0].status, 'done');
});

test('workflow fica concluído quando chega o aviso de término', () => {
  const session = firstSession([
    ev(5, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    ev(1, 'UserPromptSubmit', { workflow_run_id: 'wf_1' }),
  ]);
  assert.equal(session.workflows[0].status, 'done');
});

test('agente não terminado numa sessão encerrada fica sem sinal', () => {
  const session = firstSession([ev(3, 'SubagentStart', { agent_id: 'a1', agent_type: 'general-purpose' }), ev(1, 'SessionEnd')]);
  assert.equal(session.agents[0].status, 'stale');
});

const startAgent = (minAgo: number, id: string, type = 'general-purpose') => ev(minAgo, 'SubagentStart', { agent_id: id, agent_type: type });
const silentAgent = (events: AgentEvent[]) => firstSession(events).agents[0];

test('agente sem nova ação há mais de 10 minutos ganha silentSince e continua rodando', () => {
  const agent = silentAgent([startAgent(20, 'a1'), ev(13, 'PreToolUse', { agent_id: 'a1', tool: 'Read', summary: 'spec.md' }), ev(12, 'PostToolUse', { agent_id: 'a1', tool: 'Read' })]);
  assert.deepEqual([agent.status, agent.silentSince], ['running', 12]);
});

test('agente com ação recente não tem silentSince', () => {
  assert.equal(silentAgent([startAgent(20, 'a1'), ev(2, 'PostToolUse', { agent_id: 'a1', tool: 'Read' })]).silentSince, null);
});

test('agente com ferramenta iniciada e sem fim não conta como parado', () => {
  const agent = silentAgent([startAgent(20, 'a1'), ev(15, 'PreToolUse', { agent_id: 'a1', tool: 'Bash', summary: 'npm test' })]);
  assert.deepEqual([agent.status, agent.silentSince], ['running', null]);
});

test('agente que começou há mais de 10 minutos sem nenhuma ação conta o silêncio desde o início', () => {
  assert.equal(silentAgent([startAgent(14, 'a1')]).silentSince, 14);
});

test('agente terminado não tem silentSince', () => {
  assert.equal(silentAgent([startAgent(30, 'a1'), ev(20, 'SubagentStop', { agent_id: 'a1', summary: 'ok' })]).silentSince, null);
});

const tokens = (input: number, output: number, cacheCreation = 0, cacheRead = 0) => ({
  input_tokens: input, output_tokens: output, cache_creation_tokens: cacheCreation, cache_read_tokens: cacheRead,
});
const stopAgent = (minAgo: number, id: string, usage: ReturnType<typeof tokens>, extra: EventExtra = {}) => ev(minAgo, 'SubagentStop', { agent_id: id, summary: 'APROVADO', ...usage, ...extra });

test('agente terminado expõe os tokens, com número principal só de entrada e saída', () => {
  const agent = silentAgent([startAgent(5, 'a1'), stopAgent(1, 'a1', tokens(100, 50, 2000, 9000))]);
  assert.deepEqual(agent.tokens, { input: 100, output: 50, cacheCreation: 2000, cacheRead: 9000, primary: 150 });
});

test('agente ainda rodando não tem tokens medidos', () => {
  assert.equal(silentAgent([startAgent(1, 'a1')]).tokens, null);
});

test('tokens da sessão são o acumulado da conversa mais os agentes', () => {
  const session = firstSession([
    ev(10, 'SessionStart'),
    ev(9, 'Stop', tokens(10, 5, 100, 1000)),
    startAgent(8, 'a1'),
    stopAgent(7, 'a1', tokens(20, 10, 200, 2000)),
    ev(1, 'Stop', tokens(40, 20, 400, 4000)),
  ]);
  assert.deepEqual(session.tokens.conversation, { input: 40, output: 20, cacheCreation: 400, cacheRead: 4000, primary: 60 });
  assert.deepEqual(session.tokens.agents, { input: 20, output: 10, cacheCreation: 200, cacheRead: 2000, primary: 30 });
  assert.deepEqual(session.tokens.total, { input: 60, output: 30, cacheCreation: 600, cacheRead: 6000, primary: 90 });
});

test('sessão sem Stop e sem agentes terminados tem tokens zerados', () => {
  assert.equal(firstSession([ev(1, 'PreToolUse', { tool: 'Bash' })]).tokens.total.primary, 0);
});

test('agentes avulsos são agrupados por tipo com chamadas, total, parte da sessão e reprovações', () => {
  const session = firstSession([
    ev(21, 'SessionStart'),
    ev(20, 'Stop', tokens(30, 30)),
    startAgent(19, 'a1', 'logic-reviewer'), stopAgent(18, 'a1', tokens(30, 10), { summary: 'VEREDITO: REPROVADO' }),
    startAgent(17, 'a2', 'logic-reviewer'), stopAgent(16, 'a2', tokens(20, 20), { summary: 'VEREDITO: APROVADO' }),
    startAgent(15, 'a3', 'general-purpose'), stopAgent(14, 'a3', tokens(10, 10)),
  ]);
  const reviewers = session.agentGroups.find((group) => group.type === 'logic-reviewer');
  assert.ok(reviewers);
  assert.deepEqual([reviewers.callCount, reviewers.tokens.primary, reviewers.sessionShare, reviewers.rejectedCount, reviewers.agents.length], [2, 80, 0.5, 1, 2]);
  assert.equal(session.agentGroups.length, 2);
});

const workflowWithAgents = (taskOf: (index: number) => string | null, count: number) => [
  ev(100, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
  ...Array.from({ length: count }, (_, index) => `a${index + 1}`).flatMap((id, index) => [
    ev(99 - index * 2, 'SubagentStart', { agent_id: id, agent_type: 'workflow-subagent' }),
    stopAgent(98 - index * 2, id, tokens(10, 10), { workflow_run_id: 'wf_1', task: taskOf(index) }),
  ]),
];

test('agentes de workflow só são somados quando o início da tarefa é idêntico', () => {
  const sameStart = 'Revise a fase 2 do plano e confira os arquivos alterados contra a spec';
  const session = firstSession(workflowWithAgents((index: number) => (index < 2 ? `${sameStart} (parte ${index})` : 'Teste a fase 3 no navegador'), 3));
  const groups = session.workflows[0].agentGroups;
  const [merged, alone] = groups;
  assert.equal(groups.length, 2);
  assert.deepEqual([merged.callCount, merged.tokens.primary, merged.probableSameAgent], [2, 40, true]);
  assert.deepEqual([alone.callCount, alone.probableSameAgent], [1, false]);
});

test('uma letra de diferença no início da tarefa separa os agentes', () => {
  const session = firstSession(workflowWithAgents((index: number) => `${'a'.repeat(59)}${index}`, 2));
  assert.deepEqual(session.workflows[0].agentGroups.map((group) => group.callCount), [1, 1]);
});

test('agentes de workflow sem tarefa conhecida não são somados', () => {
  const session = firstSession([
    ev(30, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    ev(29, 'SubagentStart', { agent_id: 'a1', agent_type: 'workflow-subagent' }),
    ev(28, 'SubagentStart', { agent_id: 'a2', agent_type: 'workflow-subagent' }),
  ]);
  assert.deepEqual(session.workflows[0].agentGroups.map((group) => group.callCount), [1, 1]);
});

test('agente de workflow recebe rótulo da tarefa', () => {
  const session = firstSession(workflowWithAgents((index: number) => (index === 0 ? 'Revise a lógica da fase 2 do plano e confira' : null), 3));
  const labels = session.workflows[0].agents.map((agent) => agent.label);
  assert.deepEqual(labels, ['Revise a lógica da', 'agente 2', 'agente 3']);
});

test('textos da tela não mostram ids', () => {
  const session = firstSession([
    startAgent(5, 'a1', 'Explore'),
    ev(4, 'SubagentStart', { agent_id: 'a2' }),
    ev(30, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_9', workflow_name: 'revisao' }),
  ]);
  const labels = session.agents.map((agent) => agent.label);
  assert.deepEqual(labels, ['Explore', 'agente 2']);
});

test('reprovação vem do resultado e guarda o trecho do motivo', () => {
  const rejected = firstSession([startAgent(5, 'a1'), stopAgent(4, 'a1', tokens(1, 1), { summary: 'VEREDITO: REPROVADO — falta teste' })]).agents[0];
  const approved = firstSession([startAgent(5, 'a1'), stopAgent(4, 'a1', tokens(1, 1), { summary: 'VEREDITO: APROVADO' })]).agents[0];
  const none = firstSession([startAgent(5, 'a1'), stopAgent(4, 'a1', tokens(1, 1), { summary: 'nenhum REPROVADO encontrado' })]).agents[0];
  assert.equal(rejected.rejectionReason, 'VEREDITO: REPROVADO — falta teste');
  assert.deepEqual([approved.rejectionReason, none.rejectionReason], [null, null]);
});

test('workflow grande esconde concluídos sem alerta', () => {
  const agents = Array.from({ length: 8 }, (_, index) => `a${index + 1}`);
  const events = [
    ev(100, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    ...agents.flatMap((id, index) => [
      ev(99 - index, 'SubagentStart', { agent_id: id, agent_type: 'workflow-subagent' }),
      ...(index < 5 ? [stopAgent(50 - index, id, tokens(1, 1), { workflow_run_id: 'wf_1', summary: index === 4 ? 'VEREDITO: REPROVADO x' : 'APROVADO' })] : []),
    ]),
  ];
  const workflow = firstSession(events).workflows[0];
  assert.equal(workflow.hiddenDone, 4);
  assert.equal(workflow.visibleAgents.length, 4);
  assert.equal(workflow.visibleAgents.some((agent) => agent.status === 'done' && !agent.rejectionReason), false);
});

test('workflow com 6 agentes mostra todos', () => {
  const agents = Array.from({ length: 6 }, (_, index) => `a${index + 1}`);
  const events = [
    ev(100, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    ...agents.flatMap((id, index) => [ev(99 - index, 'SubagentStart', { agent_id: id, agent_type: 'workflow-subagent' }), ...(index < 5 ? [stopAgent(50 - index, id, tokens(1, 1), { workflow_run_id: 'wf_1' })] : [])]),
  ];
  const workflow = firstSession(events).workflows[0];
  assert.deepEqual([workflow.hiddenDone, workflow.visibleAgents.length], [0, 6]);
});

test('workflow e sessão acendem quando um descendente agiu', () => {
  const session = firstSession([
    evSecondsAgo(300, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    evSecondsAgo(200, 'SubagentStart', { agent_id: 'a1', agent_type: 'workflow-subagent' }),
    evSecondsAgo(200, 'SubagentStart', { agent_id: 'a2', agent_type: 'workflow-subagent' }),
    evSecondsAgo(60, 'PostToolUse', { agent_id: 'a2', tool: 'Read' }),
    evSecondsAgo(5, 'PostToolUse', { agent_id: 'a1', tool: 'Read' }),
  ]);
  const [firstAgent, secondAgent] = session.workflows[0].agents;
  assert.deepEqual([firstAgent.lit, secondAgent.lit, session.workflows[0].lit, session.lit], [true, false, true, true]);
});

test('painel congelado não acende nada', () => {
  const events = [evSecondsAgo(5, 'PostToolUse', { tool: 'Read' })];
  assert.equal(firstSession(events, NOW, { connected: false, lastUpdateAt: NOW }).lit, false);
});

test('linha do agente acompanha o estado dele no board', () => {
  const session = firstSession([startAgent(3, 'a1'), evSecondsAgo(5, 'PostToolUse', { agent_id: 'a1', tool: 'Read' }), startAgent(3, 'a2')]);
  assert.deepEqual(session.agents.map(lineState), ['flow', 'dashed']);
});

test('batimento e ritmo do workflow e da sessão somam os agentes abaixo', () => {
  const session = firstSession([
    evSecondsAgo(300, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    evSecondsAgo(200, 'SubagentStart', { agent_id: 'a1', agent_type: 'workflow-subagent' }),
    evSecondsAgo(100, 'PostToolUse', { agent_id: 'a1', tool: 'Read' }),
    evSecondsAgo(50, 'PostToolUse', { tool: 'Read' }),
  ]);
  assert.deepEqual([session.workflows[0].agents[0].actionAt.length, session.workflows[0].actionAt.length, session.actionAt.length], [1, 1, 3]);
});

const tokensOfDay = (session: Session) => Object.fromEntries(Object.entries(session.tokens.byDay).map(([day, usage]) => [day, usage.primary]));
const NOW_SP = Date.parse('2026-11-12T09:30:00-03:00');
const sp = (events: AgentEvent[], now = NOW_SP, options: BoardOptions = {}) => buildBoard(events, now, { timeZone: SP, ...options });
const twoDaySession = [
  evAt('2026-11-11T20:00:00-03:00', 'SessionStart'),
  evAt('2026-11-11T23:00:00-03:00', 'Stop', tokens(90000, 10000)),
  evAt('2026-11-12T08:00:00-03:00', 'Stop', tokens(140000, 20000)),
];

test('tokens do dia não dobram sessão de dois dias', () => {
  const [session] = allSessionsOf(sp(twoDaySession));
  assert.deepEqual(tokensOfDay(session), { '2026-11-11': 100000, '2026-11-12': 60000 });
  assert.deepEqual([session.tokens.day.primary, session.tokens.total.primary], [60000, 160000]);
});

test('na vista de ontem o dia é ontem', () => {
  const [session] = allSessionsOf(sp(twoDaySession, NOW_SP, { day: '2026-11-11' }));
  assert.equal(session.tokens.day.primary, 100000);
});

test('tokens do agente entram no dia do término', () => {
  const [session] = allSessionsOf(sp([
    evAt('2026-11-11T23:00:00-03:00', 'SessionStart'),
    evAt('2026-11-11T23:50:00-03:00', 'SubagentStart', { agent_id: 'a1', agent_type: 'general-purpose' }),
    evAt('2026-11-12T00:10:00-03:00', 'SubagentStop', { agent_id: 'a1', summary: 'ok', ...tokens(20000, 5000) }),
  ]));
  assert.deepEqual(tokensOfDay(session), { '2026-11-12': 25000 });
});

test('ações do dia contam só os eventos do dia', () => {
  const yesterday = Array.from({ length: 5 }, (_, index) => evAt(`2026-11-11T${19 + index}:30:00-03:00`, 'PostToolUse', { tool: 'Read' }));
  const today = Array.from({ length: 3 }, (_, index) => evAt(`2026-11-12T0${index + 1}:00:00-03:00`, 'PostToolUse', { tool: 'Read' }));
  const [session] = allSessionsOf(sp([evAt('2026-11-11T18:00:00-03:00', 'SessionStart'), ...yesterday, ...today]));
  assert.deepEqual(session.actionsByDay, { '2026-11-11': 5, '2026-11-12': 3 });
});

const weekPrimaryByDay = (week: ReturnType<typeof buildWeekTokens>) => Object.fromEntries(week.days.map(({ day, tokens: usage }) => [day, usage.primary]));

test('semana soma os dias sem contar em dobro', () => {
  const week = buildWeekTokens(twoDaySession, NOW_SP, SP);
  assert.equal(week.total.primary, 160000);
  assert.equal(week.days.length, 7);
  assert.deepEqual(week.days.slice(0, 2).map(({ tokens: usage }) => usage.primary), [60000, 100000]);
});

test('semana inclui sessão encerrada ontem, que o mapa de hoje não mostra', () => {
  const events = [
    evAt('2026-11-11T20:00:00-03:00', 'SessionStart'),
    evAt('2026-11-11T22:00:00-03:00', 'Stop', tokens(90000, 10000)),
    evAt('2026-11-11T23:00:00-03:00', 'SessionEnd'),
  ];
  assert.equal(allSessionsOf(sp(events)).length, 0);
  assert.deepEqual(weekPrimaryByDay(buildWeekTokens(events, NOW_SP, SP)), { '2026-11-12': 0, '2026-11-11': 100000, '2026-11-10': 0, '2026-11-09': 0, '2026-11-08': 0, '2026-11-07': 0, '2026-11-06': 0 });
});

test('semana não muda com o dia visto no mapa', () => {
  const week = buildWeekTokens(twoDaySession, NOW_SP, SP);
  assert.equal(week.total.primary, 160000);
  assert.equal(allSessionsOf(sp(twoDaySession, NOW_SP, { day: '2026-11-11' }))[0].tokens.total.primary, 100000);
});

test('sessão nova hoje conta tudo; sem início guardado o dia começa do zero', () => {
  const [fresh] = allSessionsOf(sp([evAt('2026-11-12T07:00:00-03:00', 'SessionStart'), evAt('2026-11-12T08:00:00-03:00', 'Stop', tokens(30000, 10000))]));
  assert.equal(fresh.tokens.day.primary, 40000);
  const [truncated] = allSessionsOf(sp([
    evAt('2026-11-03T08:00:00-03:00', 'PreToolUse', { tool: 'Read' }),
    evAt('2026-11-03T09:00:00-03:00', 'Stop', tokens(400000, 100000)),
    evAt('2026-11-12T08:00:00-03:00', 'Stop', tokens(430000, 110000)),
  ]));
  assert.deepEqual([truncated.tokens.day.primary, truncated.startMissing], [40000, true]);
});

test('queda do acumulado não gera tokens negativos', () => {
  const [session] = allSessionsOf(sp([
    evAt('2026-11-12T06:00:00-03:00', 'SessionStart'),
    evAt('2026-11-12T07:00:00-03:00', 'Stop', tokens(150000, 10000)),
    evAt('2026-11-12T08:00:00-03:00', 'Stop', tokens(15000, 5000)),
    evAt('2026-11-12T09:00:00-03:00', 'Stop', tokens(30000, 5000)),
  ]));
  assert.equal(session.tokens.day.primary, 175000);
  assert.equal(session.tokens.conversation.primary, 175000);
});

test('sessão iniciada ontem leva a marca de início', () => {
  const yesterdayStart = [evAt('2026-11-11T22:40:00-03:00', 'SessionStart', { summary: 'startup' }), evAt('2026-11-12T08:00:00-03:00', 'PostToolUse', { tool: 'Read' })];
  assert.equal(allSessionsOf(sp(yesterdayStart))[0].startedLabel, 'começou ontem às 22:40');
  const threeDaysStart = [evAt('2026-11-09T22:40:00-03:00', 'SessionStart'), evAt('2026-11-12T08:00:00-03:00', 'PostToolUse', { tool: 'Read' })];
  assert.equal(allSessionsOf(sp(threeDaysStart))[0].startedLabel, 'começou há 3 dias, às 22:40');
  assert.equal(allSessionsOf(sp([evAt('2026-11-12T07:00:00-03:00', 'SessionStart'), evAt('2026-11-12T08:00:00-03:00', 'PostToolUse', { tool: 'Read' })]))[0].startedLabel, null);
});

test('evento com horário um pouco à frente do relógio do navegador aparece e acende', () => {
  const session = firstSession([evSecondsAgo(-5, 'PostToolUse', { tool: 'Read' })]);
  assert.deepEqual([session?.status, session?.lit], ['running', true]);
});

test('sessão que começou sem SessionStart guardado não conta o primeiro Stop', () => {
  const [session] = allSessionsOf(sp([evAt('2026-11-09T08:00:00-03:00', 'Stop', tokens(300000, 100000)), evAt('2026-11-12T08:00:00-03:00', 'Stop', tokens(330000, 110000))]));
  assert.deepEqual([session.startMissing, session.tokens.day.primary, session.startMissingNotice], [true, 40000, 'início não guardado']);
});

test('sessão com início guardado não traz o aviso', () => {
  assert.equal(allSessionsOf(sp([evAt('2026-11-12T08:00:00-03:00', 'SessionStart', { summary: 'startup' })]))[0].startMissingNotice, null);
});

test('retomada marca a volta mesmo com intervalo curto, se a sessão estava em sua vez', () => {
  const [person] = sp([evAt('2026-11-11T22:00:00-03:00', 'SessionStart'), evAt('2026-11-11T23:55:00-03:00', 'Stop'), evAt('2026-11-12T00:03:00-03:00', 'PreToolUse', { tool: 'Read' })]);
  assert.equal(person.sessions[0].resumedAt, 'retomada às 00:03');
});

test('sessão que seguia trabalhando na virada do dia não leva marca de retomada', () => {
  const [person] = sp([evAt('2026-11-11T22:00:00-03:00', 'SessionStart'), evAt('2026-11-11T23:59:00-03:00', 'PostToolUse', { tool: 'Read' }), evAt('2026-11-12T00:01:00-03:00', 'PostToolUse', { tool: 'Read' })]);
  assert.equal(person.sessions[0].resumedAt, null);
});

test('workflow grande traz o texto dos concluídos escondidos', () => {
  const agents = Array.from({ length: 8 }, (_, index) => `a${index + 1}`);
  const events = [
    ev(100, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    ...agents.flatMap((id, index) => [ev(99 - index, 'SubagentStart', { agent_id: id, agent_type: 'workflow-subagent' }), ...(index < 4 ? [stopAgent(50 - index, id, tokens(1, 1), { workflow_run_id: 'wf_1' })] : [])]),
  ];
  assert.equal(firstSession(events).workflows[0].hiddenDoneLabel, '4 concluídos · mostrar');
  assert.equal(firstSession(workflowWithAgents(() => 'x', 2)).workflows[0].hiddenDoneLabel, null);
});

test('SessionStart de retomada não conta como início', () => {
  const [session] = allSessionsOf(sp([evAt('2026-11-11T22:40:00-03:00', 'SessionStart', { summary: 'resume' }), evAt('2026-11-12T08:00:00-03:00', 'PostToolUse', { tool: 'Read' })]));
  assert.deepEqual([session.startedLabel, session.startMissing], [null, true]);
});

test('sessão com eventos depois do dia leva a marca de continuação', () => {
  const events = [evAt('2026-11-11T22:40:00-03:00', 'SessionStart'), evAt('2026-11-11T23:00:00-03:00', 'PostToolUse', { tool: 'Read' }), evAt('2026-11-12T08:00:00-03:00', 'PostToolUse', { tool: 'Read' })];
  const [past] = allSessionsOf(sp(events, NOW_SP, { day: '2026-11-11' }));
  assert.equal(past.continuesAfter, 'continua hoje');
  assert.equal(allSessionsOf(sp(events))[0].continuesAfter, null);
});

test('sessão aberta sem evento hoje vai para o grupo recolhido', () => {
  const [person] = sp([
    evAt('2026-11-11T22:00:00-03:00', 'SessionStart', { session_id: 'turn' }), evAt('2026-11-11T23:00:00-03:00', 'Stop', { session_id: 'turn' }),
    evAt('2026-11-11T22:00:00-03:00', 'SessionStart', { session_id: 'quiet' }), evAt('2026-11-11T23:00:00-03:00', 'PostToolUse', { session_id: 'quiet', tool: 'Read' }),
    evAt('2026-11-11T22:00:00-03:00', 'SessionStart', { session_id: 'over' }), evAt('2026-11-11T23:00:00-03:00', 'SessionEnd', { session_id: 'over' }),
  ]);
  assert.deepEqual(person.openIdle.map((session) => session.id).sort(), ['quiet', 'turn']);
  assert.deepEqual(person.sessions, []);
  assert.deepEqual(person.endedToday, []);
});

test('evento novo hoje traz a sessão de volta com a hora', () => {
  const [person] = sp([
    evAt('2026-11-11T22:00:00-03:00', 'SessionStart'), evAt('2026-11-11T23:00:00-03:00', 'Stop'),
    evAt('2026-11-12T09:12:00-03:00', 'PreToolUse', { tool: 'Read' }),
  ]);
  assert.deepEqual([person.sessions.length, person.openIdle.length, person.sessions[0].resumedAt], [1, 0, 'retomada às 09:12']);
});

test('sessão sem o início guardado avisa', () => {
  const semInicio = allSessionsOf(sp([evAt('2026-11-05T09:00:00-03:00', 'PreToolUse', { tool: 'Read' }), evAt('2026-11-12T09:00:00-03:00', 'PreToolUse', { tool: 'Read' })]))[0];
  const retomada = allSessionsOf(sp([evAt('2026-11-12T09:00:00-03:00', 'SessionStart', { summary: 'resume' })]))[0];
  const normal = allSessionsOf(sp([evAt('2026-11-12T09:00:00-03:00', 'SessionStart', { summary: 'startup' })]))[0];
  assert.deepEqual([semInicio.startMissing, retomada.startMissing, normal.startMissing], [true, true, false]);
});

test('dia passado usa o fim do dia como agora', () => {
  const events = [evAt('2026-11-11T22:00:00-03:00', 'SessionStart'), evAt('2026-11-11T23:55:00-03:00', 'PostToolUse', { tool: 'Read' })];
  assert.equal(allSessionsOf(sp(events, NOW_SP, { day: '2026-11-11' }))[0].status, 'running');
  assert.equal(allSessionsOf(sp(events))[0].status, 'stale');
});

test('com o painel desconectado o agora é a última atualização', () => {
  const now = Date.parse('2026-11-12T14:50:00Z');
  const events = [evAt('2026-11-12T14:20:00Z', 'SessionStart'), evAt('2026-11-12T14:30:00Z', 'PostToolUse', { tool: 'Read' })];
  assert.equal(firstSession(events, now, { connected: false, lastUpdateAt: Date.parse('2026-11-12T14:32:00Z') }).status, 'running');
  assert.equal(firstSession(events, now).status, 'stale');
});

test('sessão parada de ontem não conta na aba', () => {
  const now = Date.parse('2026-11-12T09:00:00-03:00');
  const board = sp([evAt('2026-11-11T22:00:00-03:00', 'SessionStart'), evAt('2026-11-11T23:50:00-03:00', 'Stop')], now);
  assert.deepEqual(tabIndicator(mapSessionsOf(board)), { title: 'Painel de agentes', dot: false });
});

test('sua vez recente de antes da meia-noite fica fora do ponto da aba', () => {
  const board = sp([evAt('2026-11-11T22:00:00-03:00', 'SessionStart'), evAt('2026-11-11T23:50:00-03:00', 'Stop')], Date.parse('2026-11-12T00:10:00-03:00'));
  assert.deepEqual([board[0].openIdle.length, tabIndicator(mapSessionsOf(board)).dot], [1, false]);
});

test('pedido de permissão de ontem ainda conta até virar sua vez', () => {
  const events = [evAt('2026-11-11T22:00:00-03:00', 'SessionStart'), evAt('2026-11-11T23:50:00-03:00', 'Notification', { summary: 'permission_prompt: x' })];
  const board = sp(events, Date.parse('2026-11-12T00:30:00-03:00'));
  assert.equal(tabIndicator(mapSessionsOf(board)).title, '(1) Painel de agentes');
});

const twoSessions = (secondEvents: AgentEvent[]) => [
  ev(30, 'SessionStart', { session_id: 'A' }), ev(1, 'PreToolUse', { session_id: 'A', tool: 'Read' }),
  ev(25, 'SessionStart', { session_id: 'B' }), ...secondEvents,
];

test('ordem não muda quando o estado muda', () => {
  const running = boardOf(twoSessions([ev(2, 'PreToolUse', { session_id: 'B', tool: 'Read' })]))[0].sessions.map((session) => session.id);
  const waiting = boardOf(twoSessions([ev(1, 'Notification', { session_id: 'B', summary: 'permission_prompt: x' })]))[0].sessions.map((session) => session.id);
  assert.deepEqual([running, waiting], [['A', 'B'], ['A', 'B']]);
});

test('aguardando sobe na faixa sem reordenar o mapa', () => {
  const board = boardOf(twoSessions([ev(1, 'Notification', { session_id: 'B', summary: 'permission_prompt: x' })]));
  assert.deepEqual(attentionItems(board, NOW).map((item) => item.target), ['B']);
  assert.deepEqual(board[0].sessions.map((session) => session.id), ['A', 'B']);
});

test('sessões encerradas vão para o grupo recolhido', () => {
  const [person] = boardOf([
    ev(30, 'SessionStart', { session_id: 'A' }), ev(20, 'SessionEnd', { session_id: 'A' }),
    ev(30, 'SessionStart', { session_id: 'B' }), ev(10, 'SessionEnd', { session_id: 'B' }),
    ev(30, 'SessionStart', { session_id: 'C' }), ev(1, 'PreToolUse', { session_id: 'C', tool: 'Read' }),
  ]);
  assert.deepEqual([person.endedToday.length, person.sessions.map((session) => session.id)], [2, ['C']]);
});

const agentsActingSecondsAgo = (secondsList: number[]) => secondsList.flatMap((seconds, index) => [
  evSecondsAgo(600, 'SubagentStart', { agent_id: `a${index}`, agent_type: 'general-purpose' }),
  evSecondsAgo(seconds, 'PostToolUse', { agent_id: `a${index}`, tool: 'Read' }),
]);

test('mostrador conta agentes que agiram nos últimos 12 s', () => {
  assert.equal(gaugeSummary(allSessionsOf(boardOf(agentsActingSecondsAgo([12, 5, 13]))), NOW).activeAgents, 2);
});

test('mostrador conta ações do último minuto', () => {
  const events = [30, 59, 61].map((seconds) => evSecondsAgo(seconds, 'PostToolUse', { tool: 'Read' }));
  assert.equal(gaugeSummary(allSessionsOf(boardOf(events)), NOW).actionsLastMinute, 2);
});

test('mostrador soma tokens só de hoje', () => {
  const second = twoDaySession.map((event) => ({ ...event, session_id: 's2' }));
  assert.equal(gaugeSummary(allSessionsOf(sp([...twoDaySession, ...second])), NOW_SP).tokensToday, 120000);
});
