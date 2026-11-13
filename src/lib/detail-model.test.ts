import { describe, expect, test } from 'vitest';
import { NOW, UTC, agentAction, boardOf, ev, evSeconds, looseAgentStart, looseAgentStop, sessionStart, workflowAgentStart, workflowAgentStop, workflowStart } from './test-fixtures';
import { buildMapTree } from './map-tree';
import { NOTHING_SELECTED_TEXT, detailModel, type DetailModel } from './detail-model';
import type { AgentEvent, BoardOptions } from './types';

function detailOf(events: AgentEvent[], nodeId: string, options: BoardOptions = {}, extra: { taskExpanded?: boolean; pastDay?: boolean } = {}): DetailModel {
  const tree = buildMapTree(boardOf(events, options), { pastDay: extra.pastDay ?? false });
  const node = tree.nodes[nodeId];
  if (!node) throw new Error(`nó ${nodeId} não existe: ${Object.keys(tree.nodes).join(', ')}`);
  return detailModel(node, { now: NOW, timeZone: UTC, events, tree, pastDay: extra.pastDay ?? false, taskExpanded: extra.taskExpanded ?? false });
}
const permission = (minutesAgo: number) => ev(minutesAgo, 'Notification', { summary: 'permission_prompt: Claude needs your permission to use Bash' });
const reviewer = 's1::agents::logic-reviewer';

test('nada selecionado tem texto próprio', () => {
  expect(NOTHING_SELECTED_TEXT).toBe('Clique numa sessão ou num agente para ver o detalhe.');
});

describe('pedido de permissão (T43, T44)', () => {
  test('diz onde responder: pasta e branch', () => {
    const { permission: block } = detailOf([sessionStart(10), permission(6)], 's1');
    expect(block).toEqual({ since: 'há 6 min', instruction: 'Responda no terminal:', folder: 'loja-web', branch: 'main' });
  });

  test('sem branch, só a pasta (sem rótulo vazio)', () => {
    const { permission: block } = detailOf([sessionStart(10, { branch: null }), permission(6)], 's1');
    expect([block?.folder, block?.branch]).toEqual(['loja-web', null]);
  });

  test('sessão que não espera permissão não tem o bloco', () => {
    expect(detailOf([sessionStart(10), ev(1, 'Stop')], 's1').permission).toBeNull();
  });
});

describe('sua vez: última resposta', () => {
  test('mostra o texto do último Stop para decidir sem trocar de aba', () => {
    const detail = detailOf([sessionStart(10), ev(2, 'Stop', { summary: 'Terminei o ajuste. Quer que eu rode os testes?' })], 's1');
    expect(detail.lastReply).toBe('Terminei o ajuste. Quer que eu rode os testes?');
  });

  test('sem texto guardado, não inventa bloco', () => {
    expect(detailOf([sessionStart(10), ev(2, 'Stop')], 's1').lastReply).toBeNull();
  });

  test('rodando não mostra resposta antiga', () => {
    const detail = detailOf([sessionStart(10), ev(5, 'Stop', { summary: 'Pronto.' }), ev(0, 'PreToolUse', { tool: 'Read' })], 's1');
    expect(detail.lastReply).toBeNull();
  });
});

describe('Agora (T45, T46, T60)', () => {
  const edits = [sessionStart(30), ev(9, 'PostToolUse', { tool: 'Read', summary: 'src/a.ts' }), ev(4, 'PostToolUse', { tool: 'Edit', summary: 'docs/spec.md' }), ev(2, 'PostToolUse', { tool: 'Bash', summary: 'npm test' })];

  test('ritmo de 40 colunas e as últimas ações, a mais nova primeiro, com "há X" e hora exata', () => {
    const activity = detailOf([...edits, ev(0, 'PreToolUse', { tool: 'Read' })], 's1').activity;
    expect(activity?.bars).toHaveLength(40);
    expect(activity?.recentActions.map((action) => [action.text, action.relative])).toEqual([['rodou npm test', 'há 2 min'], ['editou spec.md', 'há 4 min'], ['leu a.ts', 'há 9 min']]);
    expect(activity?.recentActions[0]?.exact).toBe('12/11 11:58');
    expect([activity?.total, activity?.totalLabel, activity?.wholeSession, activity?.emptyText]).toEqual([3, 'ações em 10 min', false, null]);
  });

  test('mostra só as 5 ações mais recentes', () => {
    const many = Array.from({ length: 8 }, (_, index) => ev(8 - index, 'PostToolUse', { tool: 'Read', summary: `f${index}.ts` }));
    expect(detailOf([sessionStart(30), ...many, ev(0, 'PreToolUse', { tool: 'Read' })], 's1').activity?.recentActions).toHaveLength(5);
  });

  test('em workflow e sessão com agentes, cada ação diz de quem foi', () => {
    const events = [sessionStart(30), looseAgentStart(20, 'l1'), agentAction(3, 'l1', 'Read', 'x.ts'), ev(0, 'PreToolUse', { tool: 'Read' })];
    expect(detailOf(events, 's1').activity?.recentActions[0]?.text).toBe('logic-reviewer · leu x.ts');
  });

  test('o card do agente mostra só as ações dele', () => {
    const events = [sessionStart(30), looseAgentStart(20, 'l1'), agentAction(3, 'l1', 'Read', 'x.ts'), ev(2, 'PostToolUse', { tool: 'Edit', summary: 'y.ts' })];
    expect(detailOf(events, reviewer).activity?.recentActions.map((action) => action.text)).toEqual(['leu x.ts']);
  });

  test('sem ações nos últimos 10 min diz isso', () => {
    const activity = detailOf([sessionStart(30), ev(0, 'PreToolUse', { tool: 'Read' })], 's1').activity;
    expect([activity?.recentActions, activity?.emptyText]).toEqual([[], 'Nenhuma ação nos últimos 10 min.']);
  });

  test('sessão encerrada: o ritmo cobre a sessão inteira, do início ao fim', () => {
    const events = [sessionStart(120), ev(100, 'PostToolUse', { tool: 'Read', summary: 'a.ts' }), ev(80, 'SessionEnd')];
    const activity = detailOf(events, 's1').activity;
    expect([activity?.wholeSession, activity?.startLabel, activity?.endLabel, activity?.totalLabel, activity?.total]).toEqual([true, '10:00', '10:40', 'ação na sessão', 1]);
    expect(activity?.legend).toBe('sessão inteira (10:00–10:40)');
    expect(activity?.bars).toHaveLength(40);
    expect(activity?.recentActions).toEqual([]);
  });

  test('em dia passado o ritmo também cobre a sessão inteira', () => {
    const events = [sessionStart(120), ev(100, 'PostToolUse', { tool: 'Read', summary: 'a.ts' }), ev(90, 'Stop')];
    expect(detailOf(events, 's1', {}, { pastDay: true }).activity?.wholeSession).toBe(true);
  });
});

describe('Chamadas (T47, T48, T61)', () => {
  const rejection = 'VEREDITO: REPROVADO. O desconto passa de 100% quando o cupom é acumulado com a promoção.';
  const calls = (tokens: number[], rejectedIndex = -1) => [
    sessionStart(60),
    ...tokens.flatMap((amount, index) => [
      looseAgentStart(50 - index * 10, `l${index}`),
      looseAgentStop(46 - index * 10, `l${index}`, 'logic-reviewer', { input_tokens: amount, output_tokens: 0, summary: index === rejectedIndex ? rejection : 'VEREDITO: APROVADO' }),
    ]),
    ev(0, 'PreToolUse', { tool: 'Read' }),
  ];

  test('uma barra por chamada, com a mediana e a marca de fora da curva', () => {
    const block = detailOf(calls([1000, 1000, 5000]), reviewer).calls;
    expect(block?.items.map((call) => [call.number, call.tokensText, call.outlier, call.outlierText])).toEqual([[1, '1 mil', false, null], [2, '1 mil', false, null], [3, '5 mil', true, '5× a mediana']]);
    expect(block?.items.map((call) => call.widthPct)).toEqual([20, 20, 100]);
    expect([block?.medianText, block?.medianPct]).toEqual(['1 mil', 20]);
  });

  test('a chamada reprovada traz o trecho; o total de reprovadas aparece uma vez', () => {
    const block = detailOf(calls([1000, 1000, 1200], 2), reviewer).calls;
    expect(block?.items[2]).toMatchObject({ rejected: true, reason: rejection });
    expect(block?.items[0]).toMatchObject({ rejected: false, reason: null });
    expect(block?.rejectedText).toBe('1 reprovada (nº 3)');
  });

  test('o resumo junta chamadas, total, parte da sessão e reprovações', () => {
    expect(detailOf(calls([1000, 1000, 1200], 2), reviewer).calls?.summaryText).toBe('3 chamadas · total 3,2 mil · 100% da sessão · 1 reprovou');
    expect(detailOf(calls([1000]), reviewer).calls?.summaryText).toBe('1 chamada · total 1 mil · 100% da sessão');
  });

  test('com 1 ou 2 chamadas não há "fora da curva"', () => {
    const block = detailOf(calls([100, 9000]), reviewer).calls;
    expect(block?.items.map((call) => call.outlier)).toEqual([false, false]);
  });

  test('cada chamada diz a parte dela no agente', () => {
    const block = detailOf(calls([1000, 3000]), reviewer).calls;
    expect(block?.items.map((call) => call.shareText)).toEqual(['25% do agente', '75% do agente']);
  });

  test('chamada em andamento não tem tokens ainda', () => {
    const events = [sessionStart(60), looseAgentStart(10, 'l1'), ev(0, 'PreToolUse', { tool: 'Read', agent_id: 'l1' })];
    const [call] = detailOf(events, reviewer).calls?.items ?? [];
    expect([call?.inProgress, call?.tokensText]).toEqual([true, '—']);
  });

  test('sessão sem nenhum agente diz que não chamou ninguém', () => {
    const block = detailOf([sessionStart(5), ev(0, 'PreToolUse', { tool: 'Read' })], 's1').calls;
    expect([block?.items, block?.emptyText]).toEqual([[], 'Nenhum agente chamado nesta sessão.']);
  });

  test('sessão com agentes mostra os filhos, não a lista de chamadas', () => {
    expect(detailOf(calls([1000]), 's1').calls).toBeNull();
  });
});

describe('filhos como barras (T52)', () => {
  const events = [sessionStart(60), workflowStart(50), workflowAgentStart(49, 'a1'), workflowAgentStart(48, 'a2'), workflowAgentStop(30, 'a1', { input_tokens: 3000, output_tokens: 0 }), workflowAgentStop(20, 'a2', { input_tokens: 1000, output_tokens: 0, summary: 'REPROVADO: faltou teste' }), ev(0, 'PreToolUse', { tool: 'Read' })];

  test('o workflow lista os agentes com a barra de participação', () => {
    const detail = detailOf(events, 's1::wf::wf_1');
    expect(detail.childrenTitle).toBe('Agentes · 2');
    expect(detail.children.map((child) => [child.id, child.tokensText, child.widthPct])).toEqual([['a1', '3 mil', 100], ['a2', '1 mil', 33.3]]);
    expect(detail.children[1]?.alert).toBe('REPROVADO');
    expect(detail.children[0]?.alert).toBeNull();
  });

  test('a sessão lista o que tem abaixo', () => {
    const detail = detailOf(events, 's1');
    expect([detail.childrenTitle, detail.children.map((child) => child.id)]).toEqual(['Abaixo desta sessão', ['s1::wf::wf_1']]);
  });

  test('agente não tem filhos', () => {
    expect(detailOf(events, 'a1').children).toEqual([]);
  });
});

describe('Tokens (T49, T50, T53)', () => {
  const withTokens = [sessionStart(60), ev(50, 'Stop', { input_tokens: 7500, output_tokens: 0 }), looseAgentStart(40, 'l1'), looseAgentStop(30, 'l1', 'logic-reviewer', { input_tokens: 2000, output_tokens: 500, cache_creation_tokens: 10000, cache_read_tokens: 90000 })];

  test('agente: número, fatia da sessão, valor exato e cache recolhido à parte', () => {
    const { tokens } = detailOf(withTokens, reviewer);
    expect(tokens).toEqual({ primaryText: '2,5 mil', unknownText: null, sharePct: 25, shareText: '25% da sessão', exactText: '2.500 = entrada 2.000 + saída 500', cache: { creation: '10 mil', read: '90 mil' }, daySplit: null });
  });

  test('sem cache não mostra o recolhível', () => {
    const events = [sessionStart(60), looseAgentStart(40, 'l1'), looseAgentStop(30, 'l1')];
    expect(detailOf(events, reviewer).tokens.cache).toBeNull();
  });

  test('agente rodando ainda não tem tokens: explica quando aparecem', () => {
    const { tokens } = detailOf([sessionStart(60), looseAgentStart(10, 'l1')], reviewer);
    expect([tokens.primaryText, tokens.unknownText, tokens.exactText, tokens.shareText]).toEqual([null, 'Tokens aparecem quando o agente termina.', null, null]);
  });

  test('sessão não tem fatia; mostra o total do dia', () => {
    const { tokens } = detailOf(withTokens, 's1');
    expect([tokens.primaryText, tokens.sharePct, tokens.shareText]).toEqual(['10 mil', null, null]);
  });

  test('o workflow mostra a parte dele na sessão', () => {
    const events = [sessionStart(60), ev(50, 'Stop', { input_tokens: 3000, output_tokens: 0 }), workflowStart(45), workflowAgentStart(44, 'a1'), workflowAgentStop(30, 'a1', { input_tokens: 1000, output_tokens: 0 })];
    expect(detailOf(events, 's1::wf::wf_1').tokens.shareText).toBe('25% da sessão');
  });

  test('sessão de vários dias separa "hoje" de "sessão inteira"', () => {
    const yesterday = { ...ev(0, 'SessionStart', { cwd: '/home/joao/loja-web' }), created_at: '2026-11-11T22:00:00Z' };
    const yesterdayStop = { ...ev(0, 'Stop', { input_tokens: 4000, output_tokens: 0 }), created_at: '2026-11-11T22:30:00Z' };
    const todayStop = ev(5, 'Stop', { input_tokens: 5000, output_tokens: 0 });
    expect(detailOf([yesterday, yesterdayStop, todayStop], 's1').tokens.daySplit).toBe('hoje: 1 mil · sessão inteira: 5 mil');
  });

  test('início com mais de 7 dias que não está guardado vira aviso', () => {
    const detail = detailOf([ev(5, 'Stop', { input_tokens: 100, output_tokens: 10 })], 's1');
    expect(detail.startMissingNotice).toBe('O início desta sessão não foi guardado (hook instalado depois do começo, sessão retomada ou início com mais de 7 dias).');
    expect(detailOf([sessionStart(10), ev(5, 'Stop', { input_tokens: 100, output_tokens: 10 })], 's1').startMissingNotice).toBeNull();
  });
});

describe('textos no singular e no dia visto', () => {
  test('uma ação só fica no singular, no "Agora" e na sessão encerrada', () => {
    const now = detailOf([sessionStart(10), ev(2, 'PostToolUse', { tool: 'Read', summary: 'a.ts' })], 's1').activity;
    expect([now?.total, now?.totalLabel, now?.legend]).toEqual([1, 'ação em 10 min', null]);
    const ended = detailOf([sessionStart(40), ev(30, 'PostToolUse', { tool: 'Read', summary: 'a.ts' }), ev(0, 'SessionEnd')], 's1').activity;
    expect([ended?.total, ended?.totalLabel, ended?.legend]).toEqual([1, 'ação na sessão', 'sessão inteira (11:20–12:00)']);
  });

  test('a última resposta ignora Stop depois do "agora" da vista (dia passado)', () => {
    const detail = detailOf([sessionStart(10), ev(2, 'Stop', { summary: 'Resposta daquele dia' }), ev(-60, 'Stop', { summary: 'Resposta do dia seguinte' })], 's1');
    expect(detail.lastReply).toBe('Resposta daquele dia');
  });
});

describe('Tarefa (T51, T62)', () => {
  const longTask = 'Revise a regra de desconto do cupom no checkout e diga se há erro de arredondamento quando o cupom é acumulado com a promoção de frete grátis para pedidos acima de cem reais.';
  const events = (task: string | null) => [sessionStart(60), ...(task ? [ev(41, 'PreToolUse', { tool: 'Agent', summary: task })] : []), looseAgentStart(40, 'l1'), ev(0, 'PreToolUse', { tool: 'Read', agent_id: 'l1' })];

  test('tarefa longa vem recolhida, com a opção de ler inteira', () => {
    expect(detailOf(events(longTask), reviewer).task).toEqual({ text: longTask, canExpand: true, expanded: false });
  });

  test('depois de pedir para ler inteira, vem aberta', () => {
    expect(detailOf(events(longTask), reviewer, {}, { taskExpanded: true }).task?.expanded).toBe(true);
  });

  test('tarefa curta não oferece expandir', () => {
    expect(detailOf(events('Revise o cupom'), reviewer).task).toEqual({ text: 'Revise o cupom', canExpand: false, expanded: false });
  });

  test('sem tarefa conhecida, o bloco some', () => {
    expect(detailOf(events(null), reviewer).task).toBeNull();
  });

  test('sessão e workflow não têm tarefa', () => {
    expect(detailOf(events(longTask), 's1').task).toBeNull();
  });
});

describe('cabeçalho', () => {
  test('mostra o caminho: "Sessão" para a raiz, os pais para os filhos', () => {
    const events = [sessionStart(60), workflowStart(50), workflowAgentStart(49, 'a1'), ev(0, 'PreToolUse', { tool: 'Read' })];
    expect(detailOf(events, 's1').path).toBe('Sessão');
    expect(detailOf(events, 'a1').path).toBe('loja-web › Revisão do checkout');
  });

  test('traz título, estado e o resto que o card já calcula', () => {
    const detail = detailOf([sessionStart(24), evSeconds(5, 'PostToolUse', { tool: 'Read', summary: 'a.ts' })], 's1');
    expect([detail.title, detail.icon, detail.stateLabel, detail.stateDetail, detail.lit]).toEqual(['loja-web', 'terminal', 'rodando', 'há 24 min', true]);
  });
});
