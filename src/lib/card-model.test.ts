import { describe, expect, test } from 'vitest';
import {
  NOW, UTC, agentAction, boardOf, ev, evSeconds, looseAgentStart, looseAgentStop, sessionStart, workflowAgentStart, workflowAgentStop, workflowStart,
} from './test-fixtures';
import { buildMapTree } from './map-tree';
import { cardModel, type CardModel } from './card-model';
import type { AgentEvent, BoardOptions } from './types';

function cardOf(events: AgentEvent[], nodeId: string, options: BoardOptions = {}, extra: { open?: boolean } = {}): CardModel {
  const tree = buildMapTree(boardOf(events, options), { pastDay: false });
  const node = tree.nodes[nodeId];
  if (!node) throw new Error(`nó ${nodeId} não existe: ${Object.keys(tree.nodes).join(', ')}`);
  return cardModel(node, { now: NOW, timeZone: UTC, open: extra.open ?? true });
}
const permission = (minutesAgo: number) => ev(minutesAgo, 'Notification', { summary: 'permission_prompt: Claude needs your permission to use Bash' });
const brief = (card: CardModel) => [card.stateLabel, card.stateIcon, card.tone];

describe('estados do card de sessão (T27)', () => {
  test('cada estado tem palavra, ícone próprio e só o aguardando é âmbar', () => {
    const running = cardOf([sessionStart(5), ev(0, 'PreToolUse', { tool: 'Bash' })], 's1');
    const waiting = cardOf([sessionStart(5), permission(1)], 's1');
    const yourTurn = cardOf([sessionStart(5), ev(1, 'Stop')], 's1');
    const stale = cardOf([sessionStart(40), ev(30, 'PostToolUse', { tool: 'Read' })], 's1');
    const ended = cardOf([sessionStart(40), ev(30, 'SessionEnd')], 's1');
    expect(brief(running)).toEqual(['rodando', 'running', 'default']);
    expect(brief(waiting)).toEqual(['aguardando você', 'waiting', 'waiting']);
    expect(brief(yourTurn)).toEqual(['sua vez', 'yourTurn', 'yourTurn']);
    expect(brief(stale)).toEqual(['sem sinal', 'stale', 'stale']);
    expect(brief(ended)).toEqual(['encerrada', 'ended', 'ended']);
    const tones = [running, yourTurn, stale, ended].map((card) => card.tone);
    expect(tones).not.toContain('waiting');
  });

  test('concluído é o estado do agente que terminou', () => {
    const done = cardOf([sessionStart(30), looseAgentStart(20, 'l1'), looseAgentStop(10, 'l1')], 's1::agents::logic-reviewer');
    expect(brief(done)).toEqual(['concluído', 'done', 'default']);
  });

  test('sessão rodando mostra há quanto tempo começou', () => {
    expect(cardOf([sessionStart(24), ev(0, 'PreToolUse', { tool: 'Bash' })], 's1').stateDetail).toBe('há 24 min');
  });
});

describe('sua vez (T28)', () => {
  test('recente: "terminou há 3 min" com destaque leve', () => {
    const card = cardOf([sessionStart(20), ev(3, 'Stop')], 's1');
    expect([card.stateDetail, card.tone]).toEqual(['terminou há 3 min', 'yourTurn']);
  });

  test('antiga: "desde 11:20" em cinza', () => {
    const card = cardOf([sessionStart(60), { ...ev(0, 'Stop'), created_at: '2026-11-12T11:20:00Z' }], 's1');
    expect([card.stateLabel, card.stateDetail, card.tone]).toEqual(['sua vez', 'desde 11:20', 'yourTurnOld']);
  });
});

describe('marcas de dia (T29)', () => {
  const yesterday = (clock: string, event: string) => ({ ...ev(0, event, { cwd: '/home/joao/loja-web' }), created_at: `2026-11-11T${clock}:00Z` });

  test('começou ontem, continua hoje e retomada', () => {
    const started = cardOf([yesterday('22:40', 'SessionStart'), ev(10, 'PreToolUse', { tool: 'Read' })], 's1');
    expect(started.marks).toContain('← começou ontem às 22:40');
    const resumed = cardOf([yesterday('22:40', 'SessionStart'), yesterday('22:50', 'Stop'), { ...ev(0, 'PostToolUse', { tool: 'Read' }), created_at: '2026-11-12T09:12:00Z' }], 's1');
    expect(resumed.marks).toContain('retomada às 09:12');
  });

  test('vista de ontem mostra "continua hoje →"', () => {
    const events = [yesterday('22:40', 'SessionStart'), yesterday('22:50', 'Stop'), ev(10, 'PreToolUse', { tool: 'Read' })];
    const board = boardOf(events, { day: '2026-11-11' });
    const tree = buildMapTree(board, { pastDay: true });
    const node = tree.nodes['s1'];
    if (!node) throw new Error('sem nó');
    expect(cardModel(node, { now: NOW, timeZone: UTC, open: true }).marks).toContain('continua hoje →');
  });

  test('sessão sem marcas não mostra nada', () => {
    expect(cardOf([sessionStart(10), ev(0, 'PreToolUse', { tool: 'Read' })], 's1').marks).toEqual([]);
  });
});


describe('card de agente (T31, T32, T33, T36, T64)', () => {
  const runningAgent = [sessionStart(30), looseAgentStart(20, 'l1', 'general-purpose')];
  const agentId = 's1::agents::general-purpose';

  test('rodando com ferramenta longa: "rodando há 6 min" e a ação', () => {
    const card = cardOf([sessionStart(30), looseAgentStart(10, 'l1', 'general-purpose'), ev(6, 'PreToolUse', { agent_id: 'l1', agent_type: 'general-purpose', tool: 'Bash', summary: 'npm test' })], agentId);
    expect([card.stateLabel, card.stateDetail, card.actionText]).toEqual(['rodando', 'há 6 min', 'rodou npm test · há 6 min']);
  });

  test('sem nova ação há 14 min: destaque leve e etiqueta', () => {
    const card = cardOf([...runningAgent, ev(14, 'PostToolUse', { agent_id: 'l1', agent_type: 'general-purpose', tool: 'Read', summary: 'a.ts' }), ev(0, 'PreToolUse', { tool: 'Read' })], agentId);
    expect(card.tags).toEqual([{ kind: 'silent', text: 'sem nova ação há 14 min', icon: 'silent' }]);
    expect(card.tone).toBe('alert');
  });

  test('REPROVADO vira etiqueta violeta e leva a contagem quando há várias chamadas', () => {
    const rejected = { summary: 'VEREDITO: REPROVADO — sem teste' };
    const single = cardOf([sessionStart(30), looseAgentStart(20, 'l1'), looseAgentStop(10, 'l1', 'logic-reviewer', rejected)], 's1::agents::logic-reviewer');
    expect(single.tags).toEqual([{ kind: 'rejected', text: 'REPROVADO', icon: 'rejected' }]);
    const several = cardOf([sessionStart(30), looseAgentStart(20, 'l1'), looseAgentStop(15, 'l1', 'logic-reviewer', rejected), looseAgentStart(12, 'l2'), looseAgentStop(10, 'l2')], 's1::agents::logic-reviewer');
    expect(several.tags[0]?.text).toBe('REPROVADO · 1 de 2');
  });

  test('um card por tipo avulso com "N chamadas"', () => {
    const card = cardOf([sessionStart(30), looseAgentStart(20, 'l1'), looseAgentStop(15, 'l1'), looseAgentStart(12, 'l2'), looseAgentStop(10, 'l2')], 's1::agents::logic-reviewer');
    expect([card.title, card.tokensText, card.tokensCaption]).toEqual(['logic-reviewer', '5 mil', 'tokens · 2 chamadas']);
  });

  test('agente agrupado leva a linha resumo: chamadas, total, parte da sessão e reprovações', () => {
    const rejected = { summary: 'VEREDITO: REPROVADO — sem teste' };
    const card = cardOf([sessionStart(30), looseAgentStart(20, 'l1'), looseAgentStop(15, 'l1', 'logic-reviewer', rejected), looseAgentStart(12, 'l2'), looseAgentStop(10, 'l2')], 's1::agents::logic-reviewer');
    expect(card.callsSummary).toBe('2 chamadas · total 5 mil · 100% da sessão · 1 reprovou');
  });

  test('agente de uma chamada só ou sem tokens ainda não tem linha resumo', () => {
    expect(cardOf([sessionStart(30), looseAgentStart(20, 'l1'), looseAgentStop(15, 'l1')], 's1::agents::logic-reviewer').callsSummary).toBeNull();
    expect(cardOf(runningAgent, agentId).callsSummary).toBeNull();
  });

  test('a linha da última ação tem uma chave nova a cada ação (para o brilho recomeçar)', () => {
    const reading = (minutesAgo: number) => ev(minutesAgo, 'PreToolUse', { agent_id: 'l1', agent_type: 'general-purpose', tool: 'Read', summary: 'a.ts' });
    const first = cardOf([...runningAgent, reading(0.5)], agentId);
    const second = cardOf([...runningAgent, reading(0.5), reading(0.2)], agentId);
    expect(first.actionKey).not.toBeNull();
    expect(second.actionKey).not.toBe(first.actionKey);
    expect(cardOf(runningAgent, agentId).actionKey).toBeNull();
  });

  test('agente que acabou de concluir pulsa em verde por poucos segundos; depois não', () => {
    const finishedAgo = (seconds: number) => cardOf([sessionStart(30), looseAgentStart(20, 'l1'), { ...looseAgentStop(0, 'l1'), created_at: new Date(NOW - seconds * 1000).toISOString() }, ev(0, 'PreToolUse', { tool: 'Read' })], 's1::agents::logic-reviewer');
    expect([finishedAgo(2).justFinished, finishedAgo(5).justFinished]).toEqual([true, false]);
    expect(cardOf(runningAgent, agentId).justFinished).toBe(false);
  });

  test('agente rodando mostra "tokens ao terminar" no lugar do número', () => {
    const card = cardOf(runningAgent, agentId);
    expect([card.tokensText, card.tokensCaption]).toEqual([null, 'tokens ao terminar']);
  });

  test('batimento tem 20 barrinhas em qualquer card', () => {
    const events = [sessionStart(30), looseAgentStart(10, 'l1'), agentAction(0.1, 'l1'), agentAction(5, 'l1')];
    for (const id of ['s1', 's1::agents::logic-reviewer']) {
      const card = cardOf(events, id);
      expect(card.heartbeat).toHaveLength(20);
      expect(card.heartbeat.reduce((sum, count) => sum + count, 0)).toBe(2);
    }
  });

  test('barrinhas só aparecem em agente ou sessão sem filhos, e quando roda ou agiu nos últimos 10 min', () => {
    const agentId = 's1::agents::logic-reviewer';
    const runningAgent = cardOf([sessionStart(30), looseAgentStart(10, 'l1')], agentId);
    const doneQuietAgent = cardOf([sessionStart(30), looseAgentStart(25, 'l1'), looseAgentStop(20, 'l1')], agentId);
    const doneRecentAgent = cardOf([sessionStart(30), looseAgentStart(10, 'l1'), agentAction(2, 'l1'), looseAgentStop(1, 'l1')], agentId);
    const sessionWithChildren = cardOf([sessionStart(30), looseAgentStart(10, 'l1'), agentAction(1, 'l1')], 's1');
    const leafSession = cardOf([sessionStart(30), ev(0, 'PreToolUse', { tool: 'Read' })], 's1');
    expect([runningAgent, doneQuietAgent, doneRecentAgent, sessionWithChildren, leafSession].map((card) => card.showsHeartbeat)).toEqual([true, false, true, false, true]);
  });

  test('card aceso: agiu há 12 s ou menos', () => {
    const lit = cardOf([sessionStart(30), looseAgentStart(10, 'l1'), evSeconds(12, 'PostToolUse', { agent_id: 'l1', agent_type: 'logic-reviewer', tool: 'Read', summary: 'a.ts' })], 's1::agents::logic-reviewer');
    expect([lit.lit, lit.tone]).toEqual([true, 'lit']);
    const quiet = cardOf([sessionStart(30), looseAgentStart(10, 'l1'), evSeconds(13, 'PostToolUse', { agent_id: 'l1', agent_type: 'logic-reviewer', tool: 'Read', summary: 'a.ts' })], 's1::agents::logic-reviewer');
    expect(quiet.lit).toBe(false);
  });

  test('anel girando só em quem agiu: o agente e a sessão sem filhos, não o workflow nem a sessão que só repassa', () => {
    const events = [sessionStart(30), workflowStart(20), workflowAgentStart(19, 'a1'), evSeconds(3, 'PostToolUse', { agent_id: 'a1', agent_type: 'workflow-subagent', tool: 'Read', summary: 'a.ts' })];
    const tree = buildMapTree(boardOf(events), { pastDay: false });
    const workflowId = tree.nodes.a1?.parentId ?? '';
    const [agent, workflow, session] = ['a1', workflowId, 's1'].map((id) => cardOf(events, id));
    expect([agent?.ringing, workflow?.ringing, session?.ringing]).toEqual([true, false, false]);
    expect([agent?.lit, workflow?.lit, session?.lit]).toEqual([true, true, true]);
    const leafSession = cardOf([sessionStart(30), evSeconds(3, 'PostToolUse', { tool: 'Read' })], 's1');
    expect(leafSession.ringing).toBe(true);
  });

  test('sem ação nos últimos 12 s o anel não gira', () => {
    const quiet = cardOf([sessionStart(30), looseAgentStart(10, 'l1'), evSeconds(13, 'PostToolUse', { agent_id: 'l1', agent_type: 'logic-reviewer', tool: 'Read' })], 's1::agents::logic-reviewer');
    expect(quiet.ringing).toBe(false);
  });

  test('agente que acabou de começar entra deslizando; um antigo não', () => {
    const fresh = cardOf([sessionStart(30), evSeconds(2, 'SubagentStart', { agent_id: 'l1', agent_type: 'logic-reviewer' })], 's1::agents::logic-reviewer');
    const old = cardOf([sessionStart(30), looseAgentStart(10, 'l1')], 's1::agents::logic-reviewer');
    const session = cardOf([sessionStart(0.02)], 's1');
    expect([fresh.entering, old.entering, session.entering]).toEqual([true, false, false]);
  });

  test('aguardando vence o aceso na cor do card', () => {
    const card = cardOf([sessionStart(30), evSeconds(5, 'PostToolUse', { tool: 'Read', summary: 'a.ts' }), permission(0.05)], 's1');
    expect(card.tone).toBe('waiting');
  });
});

describe('card de workflow e de sessão', () => {
  const workflowEvents = [sessionStart(60), workflowStart(50), workflowAgentStart(49, 'a1'), workflowAgentStart(48, 'a2'), workflowAgentStop(30, 'a1'), ev(0, 'PreToolUse', { tool: 'Read' })];

  test('workflow mostra quantos agentes rodam e a soma dos tokens', () => {
    const workflowId = 's1::wf::wf_1';
    const card = cardOf(workflowEvents, workflowId);
    expect([card.title, card.stateLabel, card.stateDetail, card.tokensText, card.tokensCaption, card.childCount]).toEqual(['Revisão do checkout', 'rodando', '1 de 2 rodando', '1,2 mil', 'tokens · 2 agentes', 2]);
  });

  test('o agente do workflow leva o rótulo curto e o título completo na dica', () => {
    const task = 'Review the coupon discount logic in checkout and report blocking issues';
    const card = cardOf([...workflowEvents, workflowAgentStop(20, 'a2', { task })], 'a2');
    expect([card.title, card.titleHint]).toEqual(['Review the coupon discount', task]);
  });

  test('sessão mostra a pasta, os tokens do dia e a contagem do que tem dentro', () => {
    const card = cardOf(workflowEvents, 's1');
    expect([card.title, card.tokensCaption, card.childCount, card.open]).toEqual(['loja-web', 'tokens · 1 workflow', 1, true]);
  });

  test('sessão sem agentes diz "sem agentes"', () => {
    expect(cardOf([sessionStart(5), ev(0, 'PreToolUse', { tool: 'Read' })], 's1').tokensCaption).toBe('tokens · sem agentes');
  });

  test('texto de leitura de tela resume tipo, nome, estado e tokens', () => {
    expect(cardOf([sessionStart(5), ev(1, 'Stop', { input_tokens: 400, output_tokens: 100 })], 's1').ariaLabel).toBe('Sessão loja-web, sua vez, 500 tokens');
  });

  test('sem pasta conhecida o título é "sessão"', () => {
    expect(cardOf([ev(5, 'SessionStart'), ev(0, 'PreToolUse', { tool: 'Read' })], 's1').title).toBe('sessão');
  });

  test('encerrada mostra a hora do fim', () => {
    expect(cardOf([sessionStart(60), { ...ev(0, 'SessionEnd'), created_at: '2026-11-12T11:31:00Z' }], 's1').stateDetail).toBe('às 11:31');
  });
});
