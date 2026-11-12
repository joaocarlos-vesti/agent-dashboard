import { test } from 'vitest';
import assert from 'node:assert/strict';
import { isActive, heartbeat, rhythm, endedRhythm, lineState, countByDay } from './activity';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const secondsAgo = (seconds: number) => NOW - seconds * 1000;

test('batimento conta ações em 20 janelas de 30 s', () => {
  const bars = heartbeat([secondsAgo(5), secondsAgo(10), secondsAgo(590)], NOW);
  assert.equal(bars?.length, 20);
  assert.equal(bars?.[0], 1);
  assert.equal(bars?.[19], 2);
  assert.equal(bars?.reduce((sum, count) => sum + count, 0), 3);
});

test('batimento ignora ação de há mais de 10 minutos', () => {
  assert.equal(heartbeat([secondsAgo(601)], NOW)?.reduce((sum, count) => sum + count, 0), 0);
});

test('ritmo conta ações em 40 janelas de 15 s', () => {
  const columns = rhythm([secondsAgo(3), secondsAgo(14)], NOW);
  assert.equal(columns?.length, 40);
  assert.equal(columns?.[39], 2);
  assert.equal(columns?.slice(0, 39).every((count) => count === 0), true);
});

test('ritmo de sessão encerrada vai do início ao fim', () => {
  const start = Date.parse('2026-11-12T10:00:00Z');
  const end = Date.parse('2026-11-12T10:40:00Z');
  const columns = endedRhythm([start + 30 * 1000, start + 61 * 1000, end - 1000], start, end);
  assert.equal(columns?.length, 40);
  assert.deepEqual([columns?.[0], columns?.[1], columns?.[39]], [1, 1, 1]);
});

test('agente agiu há 12 s ou menos fica aceso', () => {
  assert.equal(isActive([secondsAgo(12)], NOW), true);
  assert.equal(isActive([secondsAgo(13)], NOW), false);
  assert.equal(isActive([], NOW), false);
});

test('linha segue a atividade do filho', () => {
  assert.equal(lineState({ status: 'running', lit: true }), 'flow');
  assert.equal(lineState({ status: 'running', lit: false }), 'dashed');
  assert.equal(lineState({ status: 'done', lit: false }), 'idle');
  assert.equal(lineState({ status: 'stale', lit: false }), 'idle');
});

test('contagem por dia usa o dia local', () => {
  const times = ['2026-11-11T22:00:00-03:00', '2026-11-12T00:30:00-03:00', '2026-11-12T08:00:00-03:00'].map(Date.parse);
  assert.deepEqual(countByDay(times, 'America/Sao_Paulo'), { '2026-11-11': 1, '2026-11-12': 2 });
});
