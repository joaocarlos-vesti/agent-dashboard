import { describe, expect, test } from 'vitest';
import { NOW, UTC, boardOf, ev, evSeconds, looseAgentStart, sessionStart } from './test-fixtures';
import { allSessionsOf } from './board';
import { gaugeModel, TOKENS_DEFINITION, type GaugeInput, type WeekTokensState } from './gauge-model';
import type { AgentEvent, Tokens } from './types';

const tokens = (primary: number): Tokens => ({ input: primary, output: 0, cacheCreation: 0, cacheRead: 0, primary });
const ready = (amounts: number[]): WeekTokensState => ({
  status: 'ready',
  days: amounts.map((amount, index) => ({ day: `2026-11-${String(12 - index).padStart(2, '0')}`, tokens: tokens(amount) })),
  total: tokens(amounts.reduce((sum, amount) => sum + amount, 0)),
});

function gaugeOf(events: AgentEvent[], overrides: Partial<GaugeInput> = {}) {
  const sessions = allSessionsOf(boardOf(events));
  return gaugeModel({ sessions, now: NOW, pastDay: false, viewedDay: '2026-11-12', timeZone: UTC, week: ready([1000]), ...overrides });
}
const busy = [sessionStart(30), looseAgentStart(20, 'l1'), evSeconds(3, 'PostToolUse', { agent_id: 'l1', agent_type: 'logic-reviewer', tool: 'Read', summary: 'a.ts' }), ev(0.5, 'Stop', { input_tokens: 12400, output_tokens: 0 })];

describe('mostrador (T22, T63)', () => {
  test('T22: agentes agindo, ações no último minuto e tokens de hoje', () => {
    expect(gaugeOf(busy).figures).toEqual([
      { value: '1', label: 'agindo' },
      { value: '1', label: 'ações/min' },
      { value: '12,4 mil', label: 'tokens hoje' },
    ]);
  });

  test('T63: em dia passado, o que é ao vivo vira "—" e os tokens são os do dia', () => {
    expect(gaugeOf(busy, { pastDay: true }).figures).toEqual([
      { value: '—', label: 'agindo' },
      { value: '—', label: 'ações/min' },
      { value: '12,4 mil', label: 'tokens neste dia' },
    ]);
  });
});

describe('últimos 7 dias (T23, T25)', () => {
  test('T23: valor absoluto de cada dia, a barra proporcional ao maior e o dia aberto marcado', () => {
    const { week } = gaugeOf(busy, { week: ready([4000, 1000, 0]) });
    expect(week).toEqual({
      kind: 'ready',
      totalText: '5 mil',
      rows: [
        { day: '2026-11-12', label: 'Hoje', tokensText: '4 mil', widthPct: 100, selected: true },
        { day: '2026-11-11', label: 'Ontem', tokensText: '1 mil', widthPct: 25, selected: false },
        { day: '2026-11-10', label: 'ter 10', tokensText: '0', widthPct: 0, selected: false },
      ],
    });
  });

  test('T25: carregando, erro e vazio têm texto próprio', () => {
    expect(gaugeOf(busy, { week: { status: 'loading' } }).week).toEqual({ kind: 'loading', text: 'Carregando…' });
    expect(gaugeOf(busy, { week: { status: 'error', message: 'timeout' } }).week).toEqual({ kind: 'error', text: 'Não foi possível carregar os últimos 7 dias: timeout.' });
    expect(gaugeOf(busy, { week: ready([0, 0]) }).week).toEqual({ kind: 'empty', text: 'Sem tokens nos últimos 7 dias.' });
  });

  test('o dia passado aberto fica marcado', () => {
    const { week } = gaugeOf(busy, { viewedDay: '2026-11-11', pastDay: true, week: ready([4000, 1000]) });
    expect(week.kind === 'ready' && week.rows.map((row) => row.selected)).toEqual([false, true]);
  });
});

describe('divisão por sessão do dia (T23)', () => {
  const two = [sessionStart(60, { session_id: 's1' }), ev(30, 'Stop', { session_id: 's1', input_tokens: 3000, output_tokens: 0 }), sessionStart(50, { session_id: 's2', cwd: '/home/joao/api' }), ev(20, 'Stop', { session_id: 's2', input_tokens: 9000, output_tokens: 0 }), ev(10, 'SessionEnd', { session_id: 's2' })];

  test('lista as sessões da maior para a menor, com a pasta como nome', () => {
    const { daySessions } = gaugeOf(two);
    expect(daySessions.map((row) => [row.name, row.tokensText, row.ended])).toEqual([['api', '9 mil', true], ['loja-web', '3 mil', false]]);
  });

  test('sem sessões, diz que não há nenhuma', () => {
    expect(gaugeOf([]).daySessionsEmptyText).toBe('Nenhuma sessão neste dia.');
    expect(gaugeOf(two).daySessionsEmptyText).toBeNull();
  });

  test('o título diz de que dia é a divisão', () => {
    expect(gaugeOf(two).daySessionsTitle).toBe('Por sessão · hoje');
    expect(gaugeOf(two, { pastDay: true, viewedDay: '2026-11-11' }).daySessionsTitle).toBe('Por sessão · ontem');
  });
});

test('o "Como ler" define tokens uma vez, em linguagem simples', () => {
  expect(TOKENS_DEFINITION).toMatch(/entrada e saída/);
});

