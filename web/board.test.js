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
  assert.equal(firstSession([ev(15, 'SessionStart'), ev(11, 'PreToolUse')]).status, 'stale');
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
