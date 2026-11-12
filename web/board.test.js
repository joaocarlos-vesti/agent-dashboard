import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard } from './board.js';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const at = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();
const ev = (minAgo, event, extra = {}) => ({ login: 'joao', session_id: 's1', event, created_at: at(minAgo), ...extra });
const firstSession = (events) => buildBoard(events, NOW)[0].sessions[0];

test('sessão com evento recente e sem Stop está rodando', () => {
  assert.equal(firstSession([ev(1, 'SessionStart'), ev(0, 'PreToolUse', { tool: 'Bash' })]).status, 'running');
});

test('sessão cujo último evento é Stop está aguardando o usuário', () => {
  assert.equal(firstSession([ev(2, 'SessionStart'), ev(1, 'Stop')]).status, 'idle');
});

test('sessão com SessionEnd está encerrada', () => {
  assert.equal(firstSession([ev(2, 'SessionStart'), ev(1, 'SessionEnd')]).status, 'ended');
});

test('sessão rodando sem evento há mais de 10 minutos fica sem sinal', () => {
  const session = firstSession([ev(15, 'SessionStart'), ev(12, 'PreToolUse', { tool: 'Bash' }), ev(11, 'PostToolUse', { tool: 'Bash' })]);
  assert.equal(session.status, 'stale');
});

test('ferramenta longa ainda em execução não deixa a sessão sem sinal', () => {
  assert.equal(firstSession([ev(15, 'SessionStart'), ev(14, 'PreToolUse', { tool: 'Bash' })]).status, 'running');
});

test('ferramenta sem fim há mais de 2 horas deixa a sessão sem sinal', () => {
  assert.equal(firstSession([ev(200, 'SessionStart'), ev(190, 'PreToolUse', { tool: 'Bash' })]).status, 'stale');
});

test('aviso de permissão deixa a sessão aguardando o usuário', () => {
  const session = firstSession([ev(2, 'PreToolUse', { tool: 'Bash' }), ev(1, 'Notification', { summary: 'permission_prompt: Claude needs your permission to use Bash' })]);
  assert.deepEqual([session.status, session.waitingReason], ['idle', 'permission_prompt']);
});

test('aviso de ocioso deixa a sessão aguardando o usuário', () => {
  const session = firstSession([ev(2, 'SessionStart'), ev(1, 'Notification', { summary: 'idle_prompt: Claude is waiting for your input' })]);
  assert.deepEqual([session.status, session.waitingReason], ['idle', 'idle_prompt']);
});

test('sessão volta a rodar quando chega outro evento depois do aviso', () => {
  const session = firstSession([ev(2, 'Notification', { summary: 'permission_prompt: x' }), ev(1, 'PostToolUse', { tool: 'Bash' })]);
  assert.deepEqual([session.status, session.waitingReason], ['running', null]);
});

test('aviso que não espera o usuário não muda a sessão', () => {
  const session = firstSession([ev(2, 'PreToolUse', { tool: 'Bash' }), ev(1, 'Notification', { summary: 'auth_success: Logged in' })]);
  assert.deepEqual([session.status, session.lastAt], ['running', at(2)]);
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

test('agente rodando mostra a última ação', () => {
  const session = firstSession([
    ev(3, 'PreToolUse', { tool: 'Agent', summary: 'Revisar lógica' }),
    ev(2, 'SubagentStart', { agent_id: 'a1', agent_type: 'general-purpose' }),
    ev(1, 'PreToolUse', { agent_id: 'a1', tool: 'Bash', summary: 'npm test' }),
  ]);
  const [agent] = session.agents;
  assert.deepEqual([agent.status, agent.task, agent.lastAction], ['running', 'Revisar lógica', 'Bash: npm test']);
});

test('workflow fica concluído quando chega o aviso de término', () => {
  const session = firstSession([
    ev(5, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    ev(1, 'UserPromptSubmit', { workflow_run_id: 'wf_1' }),
  ]);
  assert.equal(session.workflows[0].status, 'done');
});

test('agente não terminado numa sessão encerrada fica sem sinal', () => {
  const session = firstSession([
    ev(3, 'SubagentStart', { agent_id: 'a1', agent_type: 'general-purpose' }),
    ev(1, 'SessionEnd'),
  ]);
  assert.equal(session.agents[0].status, 'stale');
});

const startAgent = (minAgo, id, type = 'general-purpose') => ev(minAgo, 'SubagentStart', { agent_id: id, agent_type: type });
const silentAgent = (events) => firstSession(events).agents[0];

test('agente sem nova ação há mais de 10 minutos ganha silentSince e continua rodando', () => {
  const agent = silentAgent([
    startAgent(20, 'a1'),
    ev(13, 'PreToolUse', { agent_id: 'a1', tool: 'Read', summary: 'spec.md' }),
    ev(12, 'PostToolUse', { agent_id: 'a1', tool: 'Read' }),
  ]);
  assert.deepEqual([agent.status, agent.silentSince], ['running', 12]);
});

test('agente com ação recente não tem silentSince', () => {
  const agent = silentAgent([startAgent(20, 'a1'), ev(2, 'PostToolUse', { agent_id: 'a1', tool: 'Read' })]);
  assert.equal(agent.silentSince, null);
});

test('agente com ferramenta iniciada e sem fim não conta como parado', () => {
  const agent = silentAgent([startAgent(20, 'a1'), ev(15, 'PreToolUse', { agent_id: 'a1', tool: 'Bash', summary: 'npm test' })]);
  assert.deepEqual([agent.status, agent.silentSince], ['running', null]);
});

test('agente que começou há mais de 10 minutos sem nenhuma ação conta o silêncio desde o início', () => {
  assert.equal(silentAgent([startAgent(14, 'a1')]).silentSince, 14);
});

test('agente terminado não tem silentSince', () => {
  const agent = silentAgent([startAgent(30, 'a1'), ev(20, 'SubagentStop', { agent_id: 'a1', summary: 'ok' })]);
  assert.equal(agent.silentSince, null);
});

const tokens = (input, output, cacheCreation = 0, cacheRead = 0) => ({
  input_tokens: input, output_tokens: output, cache_creation_tokens: cacheCreation, cache_read_tokens: cacheRead,
});
const stopAgent = (minAgo, id, usage, extra = {}) => ev(minAgo, 'SubagentStop', { agent_id: id, summary: 'APROVADO', ...usage, ...extra });

test('agente terminado expõe os tokens, com número principal só de entrada e saída', () => {
  const agent = silentAgent([startAgent(5, 'a1'), stopAgent(1, 'a1', tokens(100, 50, 2000, 9000))]);
  assert.deepEqual(agent.tokens, { input: 100, output: 50, cacheCreation: 2000, cacheRead: 9000, primary: 150 });
});

test('agente ainda rodando não tem tokens medidos', () => {
  assert.equal(silentAgent([startAgent(1, 'a1')]).tokens, null);
});

test('tokens da sessão são o último Stop da conversa mais os agentes', () => {
  const session = firstSession([
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
    ev(20, 'Stop', tokens(30, 30)),
    startAgent(19, 'a1', 'logic-reviewer'), stopAgent(18, 'a1', tokens(30, 10), { summary: 'VEREDITO: REPROVADO' }),
    startAgent(17, 'a2', 'logic-reviewer'), stopAgent(16, 'a2', tokens(20, 20), { summary: 'VEREDITO: APROVADO' }),
    startAgent(15, 'a3', 'general-purpose'), stopAgent(14, 'a3', tokens(10, 10)),
  ]);
  const reviewers = session.agentGroups.find((group) => group.type === 'logic-reviewer');
  assert.deepEqual(
    [reviewers.callCount, reviewers.tokens.primary, reviewers.sessionShare, reviewers.rejectedCount, reviewers.agents.length],
    [2, 80, 0.5, 1, 2],
  );
  assert.equal(session.agentGroups.length, 2);
});

test('agentes de workflow só são somados quando o início da tarefa é idêntico', () => {
  const sameStart = 'Revise a fase 2 do plano e confira os arquivos alterados contra a spec';
  const session = firstSession([
    ev(30, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    ...['a1', 'a2', 'a3'].flatMap((id, index) => [
      ev(29 - index * 2, 'SubagentStart', { agent_id: id, agent_type: 'workflow-subagent' }),
      stopAgent(28 - index * 2, id, tokens(10, 10), {
        workflow_run_id: 'wf_1',
        task: index < 2 ? `${sameStart} (parte ${index})` : 'Teste a fase 3 no navegador',
      }),
    ]),
  ]);
  const groups = session.workflows[0].agentGroups;
  const [merged, alone] = groups;
  assert.equal(groups.length, 2);
  assert.deepEqual([merged.callCount, merged.tokens.primary, merged.probableSameAgent], [2, 40, true]);
  assert.deepEqual([alone.callCount, alone.probableSameAgent], [1, false]);
});

test('agentes de workflow sem tarefa conhecida não são somados', () => {
  const session = firstSession([
    ev(30, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' }),
    ev(29, 'SubagentStart', { agent_id: 'a1', agent_type: 'workflow-subagent' }),
    ev(28, 'SubagentStart', { agent_id: 'a2', agent_type: 'workflow-subagent' }),
  ]);
  assert.deepEqual(session.workflows[0].agentGroups.map((group) => group.callCount), [1, 1]);
});
