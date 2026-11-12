import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medianOf, outlierFlags, rejectionExcerpt, summarizeCalls, weekTokens } from './usage.js';

test('mediana das chamadas', () => {
  assert.equal(medianOf([10, 20, 90]), 20);
  assert.equal(medianOf([10, 20, 30, 40]), 25);
  assert.equal(medianOf([90, 10, 20]), 20);
});

test('chamada acima do dobro da mediana fica fora da curva', () => {
  assert.deepEqual(outlierFlags([10, 20, 41]), [false, false, true]);
});

test('o dobro exato da mediana não é fora da curva', () => {
  assert.deepEqual(outlierFlags([10, 20, 40]), [false, false, false]);
});

test('duas chamadas nunca ficam fora da curva', () => {
  assert.deepEqual(outlierFlags([10, 100]), [false, false]);
});

test('veredito REPROVADO guarda o trecho do motivo com até 160 caracteres', () => {
  assert.equal(rejectionExcerpt('VEREDITO: REPROVADO — falta teste do caso X'), 'VEREDITO: REPROVADO — falta teste do caso X');
  assert.equal(rejectionExcerpt(`VEREDITO: REPROVADO ${'x'.repeat(300)}`)?.length, 160);
});

test('APROVADO e "nenhum REPROVADO encontrado" não são reprovação', () => {
  assert.equal(rejectionExcerpt('VEREDITO: APROVADO'), null);
  assert.equal(rejectionExcerpt('nenhum REPROVADO encontrado'), null);
  assert.equal(rejectionExcerpt(undefined), null);
});

const call = (id, primary, result = 'ok') => ({ id, result, tokens: { input: primary, output: 0, cacheCreation: 0, cacheRead: 0, primary } });

test('grupo marca a chamada fora da curva e informa a mediana', () => {
  const group = summarizeCalls([call('a', 10), call('b', 20), call('c', 41)], 1000);
  assert.deepEqual([group.medianPrimary, group.outlierAgentIds], [20, ['c']]);
});

test('total de reprovadas é calculado no grupo, não por chamada', () => {
  const group = summarizeCalls([call('a', 10, 'VEREDITO: REPROVADO x'), call('b', 10, 'VEREDITO: REPROVADO y'), call('c', 10, 'VEREDITO: APROVADO')], 1000);
  assert.equal(group.rejectedCount, 2);
  assert.equal(group.agents.every((agent) => !('rejectedCount' in agent)), true);
});

test('sem tokens na sessão o grupo não tem percentual', () => {
  assert.equal(summarizeCalls([call('a', 10)], 0).sessionShare, null);
});

test('semana lista cada dia em valor absoluto e soma sem contar em dobro', () => {
  const tokensOf = (primary) => ({ input: primary, output: 0, cacheCreation: 0, cacheRead: 0, primary });
  const sessions = [
    { tokens: { byDay: { '2026-11-11': tokensOf(100000), '2026-11-12': tokensOf(60000) } } },
    { tokens: { byDay: { '2026-11-12': tokensOf(5000) } } },
  ];
  const week = weekTokens(sessions, ['2026-11-12', '2026-11-11', '2026-11-10']);
  assert.deepEqual(week?.days.map(({ day, tokens }) => [day, tokens.primary]), [['2026-11-12', 65000], ['2026-11-11', 100000], ['2026-11-10', 0]]);
  assert.equal(week?.total.primary, 165000);
});
