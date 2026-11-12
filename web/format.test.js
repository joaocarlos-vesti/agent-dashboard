import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTokens, pageTitle, formatRelativeTime, exactTime, describeAction, folderName, tabIndicator, describeSessionTokens, describeCallGroup } from './format.js';

test('números abaixo de mil aparecem inteiros', () => {
  assert.deepEqual([formatTokens(0), formatTokens(999)], ['0', '999']);
});

test('milhares usam "mil" com no máximo 3 algarismos significativos', () => {
  assert.deepEqual([formatTokens(1000), formatTokens(1234), formatTokens(12400), formatTokens(124000)], ['1 mil', '1,23 mil', '12,4 mil', '124 mil']);
});

test('milhões e bilhões usam "mi" e "bi"', () => {
  assert.deepEqual([formatTokens(1200000), formatTokens(1500000000)], ['1,2 mi', '1,5 bi']);
});

test('arredondamento que chega a mil passa para a unidade seguinte', () => {
  assert.deepEqual([formatTokens(999600), formatTokens(999999)], ['1 mi', '1 mi']);
});

test('contagem desconhecida aparece como traço', () => {
  assert.deepEqual([formatTokens(null), formatTokens(undefined)], ['—', '—']);
});

test('título da aba mostra quantas sessões aguardam o usuário', () => {
  assert.deepEqual([pageTitle(0), pageTitle(3)], ['Painel de agentes', '(3) Painel de agentes']);
});

test('título conta só quem aguarda permissão', () => {
  const sessions = [...Array(2).fill({ status: 'waiting' }), ...Array(3).fill({ status: 'your_turn', recent: true })];
  assert.equal(tabIndicator(sessions)?.title, '(2) Painel de agentes');
});

test('ícone da aba com ponto quando há sua vez recente', () => {
  assert.deepEqual(tabIndicator([{ status: 'your_turn', recent: true }]), { title: 'Painel de agentes', dot: true });
  assert.deepEqual(tabIndicator([{ status: 'your_turn', recent: false }]), { title: 'Painel de agentes', dot: false });
  assert.deepEqual(tabIndicator([{ status: 'waiting' }]), { title: '(1) Painel de agentes', dot: false });
});

const NOW = Date.parse('2026-11-12T17:32:30Z');
const secondsBefore = (seconds) => new Date(NOW - seconds * 1000).toISOString();

test('tempo relativo', () => {
  assert.equal(formatRelativeTime(secondsBefore(40), NOW), 'agora');
  assert.equal(formatRelativeTime(secondsBefore(3 * 60), NOW), 'há 3 min');
  assert.equal(formatRelativeTime(secondsBefore(130 * 60), NOW), 'há 2 h');
  assert.equal(formatRelativeTime(secondsBefore(26 * 3600), NOW), 'há 1 dia');
  assert.equal(formatRelativeTime(secondsBefore(50 * 3600), NOW), 'há 2 dias');
});

test('horário exato no fuso informado', () => {
  assert.equal(exactTime('2026-11-12T17:32:00Z', 'America/Sao_Paulo'), '12/11 14:32');
});

test('ação vira verbo', () => {
  assert.equal(describeAction({ tool: 'Edit', summary: 'docs/spec.md' }), 'editou spec.md');
  assert.equal(describeAction({ tool: 'Bash', summary: 'npm test' }), 'rodou npm test');
  assert.equal(describeAction({ tool: 'Read', summary: '/home/joao/app/web/board.js' }), 'leu board.js');
  assert.equal(describeAction({ tool: 'MysteryTool', summary: 'x' }), 'MysteryTool');
});

test('pasta pelo nome final', () => {
  assert.equal(folderName('/home/joao/agent-dashboard'), 'agent-dashboard');
  assert.equal(folderName('/home/joao/agent-dashboard/'), 'agent-dashboard');
  assert.equal(folderName(undefined), null);
});

test('painel mostra tokens de hoje e da sessão inteira', () => {
  assert.equal(describeSessionTokens({ day: { primary: 60000 }, total: { primary: 160000 } }), 'hoje: 60 mil · sessão inteira: 160 mil');
});

test('resumo do agente', () => {
  const group = { callCount: 3, tokens: { primary: 45000 }, sessionShare: 0.25, rejectedCount: 1 };
  assert.equal(describeCallGroup(group), '3 chamadas · total 45 mil · 25% da sessão · 1 reprovou');
  assert.equal(describeCallGroup({ ...group, callCount: 1, sessionShare: null, rejectedCount: 2 }), '1 chamada · total 45 mil · 2 reprovaram');
  assert.equal(describeCallGroup({ ...group, rejectedCount: 0 }), '3 chamadas · total 45 mil · 25% da sessão');
});
