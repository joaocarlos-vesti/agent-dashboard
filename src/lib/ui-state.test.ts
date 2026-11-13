import { describe, expect, test } from 'vitest';
import { initialUiState, uiReducer, type UiAction, type UiState } from './ui-state';

const TODAY = '2026-11-12';
const YESTERDAY = '2026-11-11';
const start = (helpSeen = true) => initialUiState({ today: TODAY, helpSeen });
const run = (state: UiState, ...actions: UiAction[]) => actions.reduce(uiReducer, state);

describe('Como ler (R78)', () => {
  test('como ler abre só na primeira visita', () => {
    expect(start(false).gauge).toBe('help');
    expect(start(true).gauge).toBeNull();
  });

  test('fechar o como ler grava a marca de visto', () => {
    const closed = run(start(false), { type: 'closeGauge' });
    expect([closed.gauge, closed.helpSeen]).toEqual([null, true]);
  });

  test('trocar o como ler pelo painel de tokens também conta como visto', () => {
    const next = run(start(false), { type: 'openGauge', panel: 'tokens' });
    expect([next.gauge, next.helpSeen]).toEqual(['tokens', true]);
  });

  test('abrir o ? depois de visto não muda a marca', () => {
    const next = run(start(true), { type: 'openGauge', panel: 'help' });
    expect([next.gauge, next.helpSeen]).toEqual(['help', true]);
  });
});

describe('clique no corpo do card', () => {
  test('seleciona e abre os filhos; clicar de novo no card aberto não fecha', () => {
    const opened = run(start(), { type: 'select', id: 's1', openChildren: true });
    expect([opened.selectedId, opened.panelOpen, opened.nodeOpen.s1]).toEqual(['s1', true, true]);
    expect(run(opened, { type: 'select', id: 's1', openChildren: true }).nodeOpen.s1).toBe(true);
  });

  test('sem pedir para abrir, só seleciona e deixa o estado dos filhos como está', () => {
    const collapsed = run(start(), { type: 'setNodeOpen', id: 's1', open: false }, { type: 'select', id: 's1' });
    expect([collapsed.selectedId, collapsed.nodeOpen.s1]).toEqual(['s1', false]);
  });
});

describe('dia escolhido (R79)', () => {
  test('escolher dia passado congela; hoje volta ao vivo', () => {
    const past = run(start(), { type: 'selectDay', day: YESTERDAY });
    expect([past.day, past.live]).toEqual([YESTERDAY, false]);
    const backToToday = run(past, { type: 'selectDay', day: TODAY });
    expect([backToToday.day, backToToday.live]).toEqual([TODAY, true]);
  });

  test('voltar ao vivo leva para hoje', () => {
    const live = run(start(), { type: 'selectDay', day: YESTERDAY }, { type: 'backToLive' });
    expect([live.day, live.live]).toEqual([TODAY, true]);
  });

  test('trocar de dia limpa a seleção e fecha o painel', () => {
    const next = run(start(), { type: 'select', id: 's1' }, { type: 'selectDay', day: YESTERDAY });
    expect([next.selectedId, next.panelOpen]).toEqual([null, false]);
  });

  test('o botão âmbar volta a hoje e seleciona a sessão que espera', () => {
    const next = run(start(), { type: 'selectDay', day: YESTERDAY }, { type: 'goToWaiting', sessionId: 's2' });
    expect([next.day, next.live, next.selectedId, next.panelOpen]).toEqual([TODAY, true, 's2', true]);
  });

  test('virar o dia com a vista ao vivo leva a vista para o novo hoje', () => {
    const next = run(start(), { type: 'setToday', today: '2026-11-13' });
    expect([next.today, next.day, next.live]).toEqual(['2026-11-13', '2026-11-13', true]);
  });

  test('virar o dia com um dia passado aberto mantém o dia visto', () => {
    const next = run(start(), { type: 'selectDay', day: YESTERDAY }, { type: 'setToday', today: '2026-11-13' });
    expect([next.day, next.live]).toEqual([YESTERDAY, false]);
  });

  test('virar o dia sobre o dia que era "ontem" e agora é "hoje" volta ao vivo', () => {
    const next = run(start(), { type: 'selectDay', day: TODAY }, { type: 'setToday', today: TODAY });
    expect(next.live).toBe(true);
    const viewingNewToday = run(start(), { type: 'selectDay', day: '2026-11-13' }, { type: 'setToday', today: '2026-11-13' });
    expect([viewingNewToday.day, viewingNewToday.live]).toEqual(['2026-11-13', true]);
  });
});

describe('seleção (R80)', () => {
  test('clicar na faixa seleciona o item e abre o painel', () => {
    const next = run(start(), { type: 'select', id: 'a1', focus: true });
    expect([next.selectedId, next.panelOpen, next.focusNonce]).toEqual(['a1', true, 1]);
  });

  test('clicar no card seleciona sem pedir para rolar até ele', () => {
    expect(run(start(), { type: 'select', id: 'a1' }).focusNonce).toBe(0);
  });

  test('fechar deixa nada selecionado', () => {
    const next = run(start(), { type: 'select', id: 'a1' }, { type: 'close' });
    expect([next.selectedId, next.panelOpen]).toEqual([null, false]);
  });

  test('selecionar revela os pais, o grupo recolhido e os concluídos escondidos', () => {
    const next = run(start(), { type: 'select', id: 'a9', reveal: { ancestorIds: ['s1', 'w1'], group: 'endedToday', workflowId: 'w1' } });
    expect(next.nodeOpen).toEqual({ s1: true, w1: true });
    expect(next.openGroups.endedToday).toBe(true);
    expect(next.expandedWorkflows).toEqual(['w1']);
  });

  test('selecionar de novo o mesmo workflow não repete o id', () => {
    const reveal = { ancestorIds: ['w1'], group: null, workflowId: 'w1' };
    const next = run(start(), { type: 'select', id: 'a1', reveal }, { type: 'select', id: 'a2', reveal });
    expect(next.expandedWorkflows).toEqual(['w1']);
  });

  test('trocar de item recolhe a tarefa que estava inteira', () => {
    const next = run(start(), { type: 'select', id: 'a1' }, { type: 'toggleTask' }, { type: 'select', id: 'a2' });
    expect(next.taskExpanded).toBe(false);
  });

  test('Esc fecha primeiro o painel do mostrador, depois o detalhe', () => {
    const open = run(start(), { type: 'select', id: 'a1' }, { type: 'openGauge', panel: 'tokens' });
    const afterFirstEsc = run(open, { type: 'escape' });
    expect([afterFirstEsc.gauge, afterFirstEsc.selectedId]).toEqual([null, 'a1']);
    const afterSecondEsc = run(afterFirstEsc, { type: 'escape' });
    expect([afterSecondEsc.selectedId, afterSecondEsc.panelOpen]).toEqual([null, false]);
  });
});

describe('mostrador (R81)', () => {
  test('clicar em tokens abre os 7 dias; ? abre o como ler', () => {
    expect(run(start(), { type: 'openGauge', panel: 'tokens' }).gauge).toBe('tokens');
    expect(run(start(), { type: 'openGauge', panel: 'help' }).gauge).toBe('help');
  });

  test('clicar de novo no mesmo botão fecha o painel', () => {
    expect(run(start(), { type: 'openGauge', panel: 'tokens' }, { type: 'openGauge', panel: 'tokens' }).gauge).toBeNull();
  });

  test('abrir um painel troca o que estava aberto', () => {
    expect(run(start(), { type: 'openGauge', panel: 'tokens' }, { type: 'openGauge', panel: 'help' }).gauge).toBe('help');
  });
});

describe('expandir (R82)', () => {
  test('mostrar concluídos escondidos do workflow', () => {
    expect(run(start(), { type: 'expand', workflowId: 'w1' }).expandedWorkflows).toEqual(['w1']);
  });

  test('abrir e fechar os grupos recolhidos', () => {
    const open = run(start(), { type: 'toggleGroup', group: 'endedToday' });
    expect([open.openGroups.endedToday, open.openGroups.openIdle]).toEqual([true, false]);
    expect(run(open, { type: 'toggleGroup', group: 'endedToday' }).openGroups.endedToday).toBe(false);
  });

  test('abrir e recolher um card guarda a escolha', () => {
    expect(run(start(), { type: 'setNodeOpen', id: 's1', open: false }).nodeOpen).toEqual({ s1: false });
  });

  test('recolher tudo fecha todos os cards com filhos', () => {
    const next = run(start(), { type: 'collapseAll', ids: ['s1', 'w1'] });
    expect(next.nodeOpen).toEqual({ s1: false, w1: false });
  });

  test('ler a tarefa inteira alterna', () => {
    const open = run(start(), { type: 'toggleTask' });
    expect(open.taskExpanded).toBe(true);
    expect(run(open, { type: 'toggleTask' }).taskExpanded).toBe(false);
  });
});
