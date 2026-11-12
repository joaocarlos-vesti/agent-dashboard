import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDay, dayBounds, dayOptions, effectiveNow, startedLabel, continuationLabel } from './day.js';

const SP = 'America/Sao_Paulo';
const NOW = Date.parse('2026-11-12T12:00:00Z');

test('evento entra no dia local, não no UTC', () => {
  assert.equal(localDay('2026-11-12T01:30:00Z', SP), '2026-11-11');
  assert.equal(localDay('2026-11-12T03:00:00Z', SP), '2026-11-12');
});

test('limites do dia local em UTC', () => {
  assert.deepEqual(dayBounds('2026-11-12', SP), { from: '2026-11-12T03:00:00.000Z', to: '2026-11-13T03:00:00.000Z' });
});

test('seletor tem 7 dias', () => {
  const options = dayOptions(NOW, SP);
  assert.equal(options?.length, 7);
  assert.deepEqual(options?.slice(0, 3), [
    { day: '2026-11-12', label: 'Hoje' },
    { day: '2026-11-11', label: 'Ontem' },
    { day: '2026-11-10', label: 'ter 10' },
  ]);
  assert.deepEqual(options?.at(-1), { day: '2026-11-06', label: 'sex 6' });
});

test('dia passado usa o fim do dia como agora', () => {
  const clock = effectiveNow({ now: NOW, day: '2026-11-11', timeZone: SP });
  assert.equal(new Date(clock).toISOString(), '2026-11-12T02:59:59.999Z');
});

test('hoje ao vivo usa o relógio real', () => {
  assert.equal(effectiveNow({ now: NOW, day: '2026-11-12', timeZone: SP }), NOW);
});

test('com o painel desconectado o agora é a última atualização', () => {
  const lastUpdateAt = Date.parse('2026-11-12T11:32:00Z');
  assert.equal(effectiveNow({ now: NOW, day: '2026-11-12', timeZone: SP, connected: false, lastUpdateAt }), lastUpdateAt);
});

test('marca de início diz ontem ou há N dias, com a hora local', () => {
  assert.equal(startedLabel('2026-11-11T22:40:00-03:00', '2026-11-12', SP), 'começou ontem às 22:40');
  assert.equal(startedLabel('2026-11-09T22:40:00-03:00', '2026-11-12', SP), 'começou há 3 dias, às 22:40');
});

test('marca de continuação nomeia o dia em que a atividade segue', () => {
  assert.equal(continuationLabel('2026-11-12T08:00:00-03:00', '2026-11-12', SP), 'continua hoje');
  assert.equal(continuationLabel('2026-11-11T08:00:00-03:00', '2026-11-12', SP), 'continua ontem');
  assert.equal(continuationLabel('2026-11-10T08:00:00-03:00', '2026-11-12', SP), 'continua em 10/11');
});
