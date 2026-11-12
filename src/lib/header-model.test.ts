import { describe, expect, test } from 'vitest';
import { NOW, UTC, boardOf, ev, sessionStart } from './test-fixtures';
import { attentionItems } from './attention';
import { buildMapTree } from './map-tree';
import { headerModel, offlineBannerText, type HeaderInput } from './header-model';
import { initialUiState, uiReducer } from './ui-state';
import type { AgentEvent } from './types';

const permission = (minutesAgo: number, session: string) => ev(minutesAgo, 'Notification', { session_id: session, summary: 'permission_prompt: Claude needs your permission to use Bash' });

function headerOf(overrides: Partial<HeaderInput> = {}, todayEvents: AgentEvent[] = []) {
  const board = boardOf(todayEvents);
  const input: HeaderInput = {
    now: NOW, lastUpdateAt: NOW, timeZone: UTC, viewedDay: '2026-11-12', pastDay: false,
    todayWaiting: attentionItems(board, NOW).filter((item) => item.kind === 'waiting'), todayTree: buildMapTree(board, { pastDay: false }), ...overrides,
  };
  return headerModel(input);
}

describe('horário da última atualização (T16)', () => {
  test('mostra o horário com segundos', () => {
    expect(headerOf({ lastUpdateAt: Date.parse('2026-11-12T14:32:10Z') }).updatedText).toBe('Atualizado às 14:32:10');
  });

  test('antes da primeira carga, diz que está esperando', () => {
    expect(headerOf({ lastUpdateAt: null }).updatedText).toBe('Aguardando a primeira atualização');
  });
});

describe('seletor de dia (T17)', () => {
  test('7 dias, hoje primeiro, só o aberto marcado', () => {
    const { days } = headerOf({ viewedDay: '2026-11-11', pastDay: true });
    expect(days).toHaveLength(7);
    expect(days.slice(0, 2).map((day) => [day.label, day.pressed])).toEqual([['Hoje', false], ['Ontem', true]]);
    expect(days.filter((day) => day.pressed)).toHaveLength(1);
  });

  test('cada dia tem a data por extenso na dica', () => {
    expect(headerOf().days[1]?.title).toBe('quarta-feira, 11 de novembro');
  });
});

describe('dia passado congelado (T10)', () => {
  test('a faixa diz o dia e que nada se mexe, com o botão de voltar ao vivo', () => {
    expect(headerOf({ viewedDay: '2026-11-11', pastDay: true }).frozen).toEqual({ text: 'Você está vendo quarta-feira, 11 de novembro. Nada aqui se mexe.', action: 'Voltar ao vivo' });
  });

  test('hoje não tem faixa de congelado', () => {
    expect(headerOf().frozen).toBeNull();
  });
});

describe('botão âmbar de quem espera você (T11)', () => {
  const waitingEvents = [sessionStart(40, { session_id: 's1' }), permission(6, 's1'), sessionStart(30, { session_id: 's2', cwd: '/home/joao/api' }), permission(2, 's2')];

  test('sem ninguém esperando, não há botão', () => {
    expect(headerOf().waiting).toBeNull();
  });

  test('uma sessão: diz o nome e há quanto tempo', () => {
    expect(headerOf({}, [sessionStart(40), permission(6, 's1')]).waiting).toMatchObject({ text: 'Aguardando você: loja-web', since: 'há 6 min', sessionId: 's1' });
  });

  test('várias: conta e leva à que espera há mais tempo', () => {
    expect(headerOf({}, waitingEvents).waiting).toMatchObject({ text: '2 sessões aguardando você', since: 'há 6 min', sessionId: 's1' });
  });

  test('continua no topo vendo um dia passado e leva de volta para hoje com a sessão selecionada', () => {
    const { waiting } = headerOf({ viewedDay: '2026-11-11', pastDay: true }, waitingEvents);
    expect(waiting?.sessionId).toBe('s1');
    const pastView = uiReducer(initialUiState({ today: '2026-11-12', helpSeen: true }), { type: 'selectDay', day: '2026-11-11' });
    const afterClick = uiReducer(pastView, { type: 'goToWaiting', sessionId: waiting?.sessionId ?? '', reveal: waiting?.reveal ?? undefined });
    expect([afterClick.day, afterClick.live, afterClick.selectedId]).toEqual(['2026-11-12', true, 's1']);
  });
});

describe('T9: aviso de conexão caída', () => {
  test('diz desde quando os dados pararam', () => {
    expect(offlineBannerText(Date.parse('2026-11-12T14:32:10Z'), UTC)).toBe('Sem conexão desde 14:32. Os dados param nesse horário; reconecta sozinho.');
  });

  test('sem nenhuma atualização ainda, não inventa horário', () => {
    expect(offlineBannerText(null, UTC)).toBe('Sem conexão com o servidor. Reconecta sozinho quando a rede voltar.');
  });
});
