import { test } from 'vitest';
import assert from 'node:assert/strict';
import { dayFilter, fetchAllPages, loadDayEvents, weekTokensFromRows } from './queries';
import type { EventFilter, EventPage, EventSource, PageRange, WeekTokensRow } from './queries';
import type { AgentEvent } from './types';

const SP = 'America/Sao_Paulo';
const event = (id: number, sessionId: string, createdAt: string): AgentEvent => ({ id, login: 'joao', session_id: sessionId, event: 'PostToolUse', created_at: createdAt });
const manyEvents = (count: number, firstId = 1): AgentEvent[] => Array.from({ length: count }, (_, index) => event(firstId + index, 's1', '2026-11-12T10:00:00Z'));
const ok = (data: AgentEvent[]): EventPage => ({ data, error: null });

/** Devolve, de uma lista, só o que cabe no intervalo pedido, como o Supabase faz com `range`. */
const pagesOf = (all: AgentEvent[], calls: PageRange[] = []) => async (range: PageRange): Promise<EventPage> => {
  calls.push(range);
  return ok(all.slice(range.from, range.to + 1));
};

test('consulta do dia usa os limites locais', () => {
  assert.deepEqual(dayFilter('2026-11-11', SP), { gte: '2026-11-11T03:00:00.000Z', lt: '2026-11-12T03:00:00.000Z' });
});

test('consulta pagina até trazer tudo', async () => {
  const calls: PageRange[] = [];
  const result = await fetchAllPages(pagesOf(manyEvents(2500), calls));
  assert.equal(result.length, 2500);
  assert.deepEqual(calls, [{ from: 0, to: 999 }, { from: 1000, to: 1999 }, { from: 2000, to: 2999 }]);
});

test('consulta com página cheia pede mais uma e para na vazia', async () => {
  const calls: PageRange[] = [];
  const result = await fetchAllPages(pagesOf(manyEvents(2000), calls));
  assert.equal(result.length, 2000);
  assert.equal(calls.length, 3);
});

test('consulta sem eventos faz uma chamada só', async () => {
  const calls: PageRange[] = [];
  assert.deepEqual(await fetchAllPages(pagesOf([], calls)), []);
  assert.equal(calls.length, 1);
});

test('erro na segunda página falha a consulta com a mensagem do Supabase', async () => {
  let page = 0;
  const failingSecondPage = async (): Promise<EventPage> => {
    page += 1;
    return page === 2 ? { data: null, error: { message: 'JWT expired' } } : ok(manyEvents(1000));
  };
  await assert.rejects(fetchAllPages(failingSecondPage), { message: 'JWT expired' });
});

test('resposta sem dados e sem erro também falha, sem devolver parcial', async () => {
  await assert.rejects(fetchAllPages(async () => ({ data: null, error: null })));
});

interface SourceCalls { dayFilters: EventFilter[]; sessionLookups: { sessionIds: string[]; outside: EventFilter }[] }
function fakeSource(dayEvents: AgentEvent[], historyBySession: Record<string, AgentEvent[]>, calls: SourceCalls): EventSource {
  return {
    eventsInRange: (filter, range) => {
      calls.dayFilters.push(filter);
      return pagesOf(dayEvents)(range);
    },
    eventsOfSessionsOutside: (sessionIds, outside, range) => {
      calls.sessionLookups.push({ sessionIds, outside });
      return pagesOf(sessionIds.flatMap((sessionId) => historyBySession[sessionId] ?? []))(range);
    },
  };
}
const emptyCalls = (): SourceCalls => ({ dayFilters: [], sessionLookups: [] });

test('consulta do dia inclui o histórico das sessões do dia', async () => {
  const calls = emptyCalls();
  const todayEvent = event(3, 's1', '2026-11-12T13:00:00Z');
  const yesterdayStart = event(1, 's1', '2026-11-11T22:40:00Z');
  const otherSession = event(2, 's2', '2026-11-11T20:00:00Z');
  const loaded = await loadDayEvents(fakeSource([todayEvent], { s1: [yesterdayStart], s2: [otherSession] }, calls), '2026-11-12', SP);
  assert.deepEqual(loaded.map(({ id }) => id), [1, 3]);
  assert.deepEqual(calls.dayFilters, [{ gte: '2026-11-12T03:00:00.000Z', lt: '2026-11-13T03:00:00.000Z' }]);
  assert.deepEqual(calls.sessionLookups, [{ sessionIds: ['s1'], outside: { gte: '2026-11-12T03:00:00.000Z', lt: '2026-11-13T03:00:00.000Z' } }]);
});

test('consulta do dia passado traz também o que a sessão fez depois', async () => {
  const lastNight = event(1, 's1', '2026-11-11T23:00:00Z');
  const nextDay = event(2, 's1', '2026-11-12T13:00:00Z');
  const loaded = await loadDayEvents(fakeSource([lastNight], { s1: [nextDay] }, emptyCalls()), '2026-11-11', SP);
  assert.deepEqual(loaded.map(({ id }) => id), [1, 2]);
});

test('sessão com vários eventos no dia é buscada uma vez só', async () => {
  const calls = emptyCalls();
  await loadDayEvents(fakeSource([event(1, 's1', '2026-11-12T13:00:00Z'), event(2, 's1', '2026-11-12T14:00:00Z')], {}, calls), '2026-11-12', SP);
  assert.deepEqual(calls.sessionLookups.map(({ sessionIds }) => sessionIds), [['s1']]);
});

test('dia sem eventos não busca sessões', async () => {
  const calls = emptyCalls();
  assert.deepEqual(await loadDayEvents(fakeSource([], {}, calls), '2026-11-12', SP), []);
  assert.deepEqual(calls.sessionLookups, []);
});

test('sessões do dia são buscadas em lotes de 50', async () => {
  const calls = emptyCalls();
  const dayEvents = Array.from({ length: 120 }, (_, index) => event(index + 1, `s${index}`, '2026-11-12T13:00:00Z'));
  await loadDayEvents(fakeSource(dayEvents, {}, calls), '2026-11-12', SP);
  assert.deepEqual(calls.sessionLookups.map(({ sessionIds }) => sessionIds.length), [50, 50, 20]);
});

test('erro na busca das sessões falha a carga do dia', async () => {
  const failingHistory: EventSource = {
    eventsInRange: (_filter, range) => pagesOf([event(1, 's1', '2026-11-12T13:00:00Z')])(range),
    eventsOfSessionsOutside: async () => ({ data: null, error: { message: 'timeout' } }),
  };
  await assert.rejects(loadDayEvents(failingHistory, '2026-11-12', SP), { message: 'timeout' });
});

const weekRow = (day: string, input: number, output: number): WeekTokensRow => ({ day, input_tokens: input, output_tokens: output, cache_creation_tokens: 0, cache_read_tokens: 0 });

test('semana do banco vira lista por dia em valores absolutos', () => {
  const week = weekTokensFromRows([weekRow('2026-11-11', 70000, 30000), weekRow('2026-11-12', 40000, 20000)], ['2026-11-12', '2026-11-11', '2026-11-10']);
  assert.deepEqual(week.days.map(({ day, tokens }) => [day, tokens.primary]), [['2026-11-12', 60000], ['2026-11-11', 100000], ['2026-11-10', 0]]);
  assert.equal(week.total.primary, 160000);
});

test('semana ignora dia fora do seletor e aceita números em texto', () => {
  const week = weekTokensFromRows([weekRow('2026-10-01', 5, 5), { ...weekRow('2026-11-12', 0, 0), input_tokens: '1500' as unknown as number }], ['2026-11-12']);
  assert.equal(week.total.primary, 1500);
});
