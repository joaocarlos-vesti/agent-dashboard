import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildBoard } from './board';
import type { AgentEvent, AttentionItem } from './types';
import { attentionItems, attentionHeadline } from './attention';

const NOW = Date.parse('2026-11-12T12:00:00Z');
type EventExtra = Partial<AgentEvent>;
const at = (minAgo: number) => new Date(NOW - minAgo * 60000).toISOString();
const secondsAgo = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();
const ev = (minAgo: number, event: string, extra: EventExtra = {}): AgentEvent => ({ login: 'joao', session_id: 's1', event, created_at: at(minAgo), ...extra });
const boardOf = (events: AgentEvent[], now = NOW) => buildBoard(events, now, { timeZone: 'UTC' });
const itemsOf = (events: AgentEvent[]) => attentionItems(boardOf(events), NOW);
const pick = (item: AttentionItem) => ({ kind: item.kind, target: item.target, text: item.text });
const startAgent = (minAgo: number, id: string, extra: EventExtra = {}) => ev(minAgo, 'SubagentStart', { agent_id: id, agent_type: 'general-purpose', ...extra });
const rejectedStop = (minAgo: number, id: string, extra: EventExtra = {}) => ev(minAgo, 'SubagentStop', { agent_id: id, summary: 'VEREDITO: REPROVADO — falta teste', ...extra });
const workflowStart = (minAgo: number) => ev(minAgo, 'PostToolUse', { tool: 'Workflow', workflow_run_id: 'wf_1', workflow_name: 'revisao' });

test('faixa lista reprovação recente', () => {
  const items = itemsOf([workflowStart(20), ev(19, 'SubagentStart', { agent_id: 'a1', agent_type: 'workflow-subagent' }), rejectedStop(5, 'a1', { workflow_run_id: 'wf_1' })]);
  assert.deepEqual(items.map(pick), [{ kind: 'rejected', target: 'a1', text: 'VEREDITO: REPROVADO — falta teste' }]);
});

test('reprovação de workflow sai da faixa quando o workflow termina', () => {
  const events = [workflowStart(20), ev(19, 'SubagentStart', { agent_id: 'a1', agent_type: 'workflow-subagent' }), rejectedStop(5, 'a1', { workflow_run_id: 'wf_1' })];
  assert.equal(itemsOf([...events, ev(1, 'UserPromptSubmit', { workflow_run_id: 'wf_1' })]).some((item) => item.kind === 'rejected'), false);
});

test('reprovação de agente avulso fica 30 minutos', () => {
  const rejectedAgo = (minAgo: number) => [startAgent(minAgo + 1, 'a1'), rejectedStop(minAgo, 'a1'), ev(0, 'PreToolUse', { tool: 'Read' })];
  assert.equal(itemsOf(rejectedAgo(29)).some((item) => item.kind === 'rejected'), true);
  assert.equal(itemsOf(rejectedAgo(31)).some((item) => item.kind === 'rejected'), false);
});

test('faixa lista agente sem nova ação há 10 min', () => {
  const silentFor = (minutes: number) => [startAgent(minutes + 5, 'a1'), ev(minutes, 'PostToolUse', { agent_id: 'a1', tool: 'Read' })];
  assert.deepEqual(itemsOf(silentFor(14)).map(pick), [{ kind: 'silent', target: 'a1', text: 'sem nova ação há 14 min' }]);
  assert.deepEqual(itemsOf(silentFor(9)), []);
});

test('o limite do "sem nova ação" é exato: 10 min entra, 9 min 59 s fica fora', () => {
  const silentForSeconds = (seconds: number) => [startAgent(15, 'a1'), { ...ev(0, 'PostToolUse', { agent_id: 'a1', tool: 'Read' }), created_at: secondsAgo(seconds) }];
  assert.deepEqual(itemsOf(silentForSeconds(600)).map(pick), [{ kind: 'silent', target: 'a1', text: 'sem nova ação há 10 min' }]);
  assert.deepEqual(itemsOf(silentForSeconds(599)), []);
});

test('reprovação de workflow aberto continua na faixa com a sessão sem sinal', () => {
  const events = [workflowStart(200), ev(199, 'SubagentStart', { agent_id: 'a1', agent_type: 'workflow-subagent' }), rejectedStop(190, 'a1', { workflow_run_id: 'wf_1' })];
  assert.deepEqual(itemsOf(events).map((item) => [item.kind, item.target]), [['rejected', 'a1'], ['stale', 's1']]);
});

test('faixa lista sessão sem sinal', () => {
  const items = itemsOf([ev(30, 'SessionStart'), ev(20, 'PostToolUse', { tool: 'Read' })]);
  assert.deepEqual(items.map((item) => [item.kind, item.target]), [['stale', 's1']]);
});

test('faixa lista sua vez só até 30 min', () => {
  assert.deepEqual(itemsOf([ev(5, 'SessionStart'), ev(3, 'Stop')]).map(pick), [{ kind: 'your_turn', target: 's1', text: 'terminou há 3 min' }]);
  assert.deepEqual(itemsOf([ev(40, 'SessionStart'), ev(31, 'Stop')]), []);
});

test('quem aguarda você vem primeiro na faixa', () => {
  const events = [
    ev(30, 'SessionStart', { session_id: 'rejeitado' }), startAgent(29, 'a1', { session_id: 'rejeitado' }), rejectedStop(5, 'a1', { session_id: 'rejeitado' }), ev(1, 'PreToolUse', { session_id: 'rejeitado', tool: 'Read' }),
    ev(30, 'SessionStart', { session_id: 'espera' }), ev(2, 'Notification', { session_id: 'espera', summary: 'permission_prompt: x' }),
  ];
  assert.deepEqual(itemsOf(events).map((item) => item.kind), ['waiting', 'rejected']);
});

test('aguardando vem antes do reprovado mesmo quando o reprovado é bem mais novo', () => {
  const events = [
    ev(30, 'SessionStart', { session_id: 'espera' }), ev(8, 'Notification', { session_id: 'espera', summary: 'permission_prompt: x' }),
    ev(30, 'SessionStart', { session_id: 'rejeitado' }), startAgent(29, 'a1', { session_id: 'rejeitado' }), rejectedStop(1, 'a1', { session_id: 'rejeitado' }),
  ];
  assert.deepEqual(itemsOf(events).map((item) => item.kind), ['waiting', 'rejected']);
});

test('faixa ignora o que não pede ação', () => {
  const events = [
    ev(30, 'SessionStart', { session_id: 'rodando' }), ev(1, 'PreToolUse', { session_id: 'rodando', tool: 'Read' }),
    ev(30, 'SessionStart', { session_id: 'encerrada' }), ev(2, 'SessionEnd', { session_id: 'encerrada' }),
    ev(60 * 30, 'SessionStart', { session_id: 'antiga' }), ev(60 * 29, 'Stop', { session_id: 'antiga' }),
  ];
  assert.deepEqual(itemsOf(events), []);
});

test('sessão aberta de ontem fica fora da faixa, parada sem sinal ou com "sua vez" recente na virada do dia', () => {
  const sp = (isoTime: string, event: string, extra: EventExtra = {}) => ({ login: 'joao', session_id: 's1', event, created_at: isoTime, ...extra });
  const morning = Date.parse('2026-11-12T09:00:00Z');
  const silentSinceYesterday = [sp('2026-11-11T22:00:00Z', 'SessionStart'), sp('2026-11-11T23:00:00Z', 'PostToolUse', { tool: 'Read' })];
  assert.deepEqual(attentionItems(boardOf(silentSinceYesterday, morning), morning), []);
  const justAfterMidnight = Date.parse('2026-11-12T00:10:00Z');
  const stopBeforeMidnight = [sp('2026-11-11T22:00:00Z', 'SessionStart'), sp('2026-11-11T23:45:00Z', 'Stop')];
  assert.deepEqual(attentionItems(boardOf(stopBeforeMidnight, justAfterMidnight), justAfterMidnight), []);
});

test('sessão sem sinal não repete os agentes dela na faixa', () => {
  const items = itemsOf([ev(200, 'SessionStart'), startAgent(199, 'a1'), startAgent(198, 'a2')]);
  assert.deepEqual(items.map((item) => [item.kind, item.target]), [['stale', 's1']]);
});

test('sem fatos a faixa diz tudo certo', () => {
  assert.equal(attentionHeadline([]), 'Tudo certo: ninguém esperando você, nada reprovado ou parado.');
  assert.equal(attentionHeadline([{ kind: 'waiting', target: 's1', sessionId: 's1', text: 'esperando permissão', at: at(1) }]), null);
});
