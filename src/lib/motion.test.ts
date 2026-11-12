import { describe, expect, test } from 'vitest';
import { ENTERING_MS, SPARK_LIFETIME_MS, SPARK_STEP_MS, isEntering, liveClockMs, pruneLiveEvents, sparksByEdge, type LiveEvent } from './motion';
import { buildMapScene } from './map-scene';
import { NOW, UTC, boardOf, ev, evSeconds, looseAgentStart, sessionStart, workflowAgentStart, workflowStart } from './test-fixtures';
import { initialUiState } from './ui-state';
import type { AgentEvent } from './types';

const ui = initialUiState({ today: '2026-11-12', helpSeen: true });
const baseEvents = [sessionStart(60), workflowStart(50), workflowAgentStart(49, 'a1'), looseAgentStart(30, 'l1')];
const sceneOf = (events: AgentEvent[], uiState = ui) => buildMapScene({ board: boardOf(events), ui: uiState, now: NOW, timeZone: UTC, pastDay: false });
const live = (event: AgentEvent, key = 'k1'): LiveEvent => ({ key, event, receivedAt: NOW });
const action = (agentId: string | null) => evSeconds(0, 'PostToolUse', { tool: 'Read', summary: 'a.ts', ...(agentId ? { agent_id: agentId, agent_type: 'workflow-subagent' } : {}) });

describe('faíscas nas linhas (uma por ação real)', () => {
  test('ação de agente de workflow corre da sessão ao workflow e ao agente, uma linha depois da outra', () => {
    const scene = sceneOf(baseEvents);
    const workflowId = scene.tree.nodes.a1?.parentId ?? '';
    const sparks = sparksByEdge([live(action('a1'))], scene.tree, scene.items);
    expect(sparks[`s1->${workflowId}`]).toEqual([{ sparkKey: 'k1', kind: 'action', reverse: false, delayMs: 0 }]);
    expect(sparks[`${workflowId}->a1`]).toEqual([{ sparkKey: 'k1', kind: 'action', reverse: false, delayMs: SPARK_STEP_MS }]);
  });

  test('ação da conversa principal não tem linha: nenhuma faísca (o card acende)', () => {
    const scene = sceneOf(baseEvents);
    expect(sparksByEdge([live(action(null))], scene.tree, scene.items)).toEqual({});
  });

  test('agente escondido: a faísca vai até o último card visível do caminho', () => {
    const scene = sceneOf(baseEvents);
    const workflowId = scene.tree.nodes.a1?.parentId ?? '';
    const collapsed = sceneOf(baseEvents, { ...ui, nodeOpen: { [workflowId]: false } });
    expect(Object.keys(sparksByEdge([live(action('a1'))], collapsed.tree, collapsed.items))).toEqual([`s1->${workflowId}`]);
  });

  test('agente de um tipo avulso sai da sessão direto para ele', () => {
    const scene = sceneOf(baseEvents);
    const looseId = scene.tree.nodeIdOfAgent.l1 ?? '';
    const sparks = sparksByEdge([live(evSeconds(0, 'PostToolUse', { agent_id: 'l1', agent_type: 'logic-reviewer', tool: 'Read' }))], scene.tree, scene.items);
    expect(Object.keys(sparks)).toEqual([`s1->${looseId}`]);
  });

  test('agente concluído: faísca verde volta do agente para quem o chamou', () => {
    const scene = sceneOf(baseEvents);
    const workflowId = scene.tree.nodes.a1?.parentId ?? '';
    const sparks = sparksByEdge([live(evSeconds(0, 'SubagentStop', { agent_id: 'a1', agent_type: 'workflow-subagent', summary: 'VEREDITO: APROVADO' }))], scene.tree, scene.items);
    expect(sparks[`${workflowId}->a1`]).toEqual([{ sparkKey: 'k1', kind: 'done', reverse: true, delayMs: 0 }]);
    expect(sparks[`s1->${workflowId}`]).toEqual([{ sparkKey: 'k1', kind: 'done', reverse: true, delayMs: SPARK_STEP_MS }]);
  });

  test('agente desconhecido ou outro tipo de evento: nenhuma faísca', () => {
    const scene = sceneOf(baseEvents);
    expect(sparksByEdge([live(action('desconhecido')), live(ev(0, 'Stop'), 'k2'), live(ev(0, 'SubagentStart', { agent_id: 'a1' }), 'k3')], scene.tree, scene.items)).toEqual({});
  });

  test('duas ações na mesma linha viram duas faíscas, com chaves diferentes', () => {
    const scene = sceneOf(baseEvents);
    const workflowId = scene.tree.nodes.a1?.parentId ?? '';
    const sparks = sparksByEdge([live(action('a1'), 'k1'), live(action('a1'), 'k2')], scene.tree, scene.items);
    expect(sparks[`${workflowId}->a1`]?.map((spark) => spark.sparkKey)).toEqual(['k1', 'k2']);
  });
});

describe('eventos ao vivo guardados só enquanto a faísca dura', () => {
  test('descarta os que passaram da vida da faísca', () => {
    const fresh = { key: 'novo', event: action('a1'), receivedAt: NOW - 500 };
    const stale = { key: 'velho', event: action('a1'), receivedAt: NOW - SPARK_LIFETIME_MS - 1 };
    expect(pruneLiveEvents([stale, fresh], NOW).map((item) => item.key)).toEqual(['novo']);
  });
});

describe('agente novo entra deslizando', () => {
  test('só nos primeiros segundos depois do início', () => {
    expect(isEntering(new Date(NOW - 1000).toISOString(), NOW)).toBe(true);
    expect(isEntering(new Date(NOW - ENTERING_MS - 1).toISOString(), NOW)).toBe(false);
  });

  test('sem horário de início, não anima', () => {
    expect(isEntering(null, NOW)).toBe(false);
  });
});

describe('relógio do painel', () => {
  test('bate a cada segundo enquanto há ação recente (para apagar o brilho no tempo certo)', () => {
    expect(liveClockMs([evSeconds(5, 'PostToolUse')], NOW)).toBe(1000);
  });

  test('sem ação recente, bate devagar', () => {
    expect(liveClockMs([evSeconds(60, 'PostToolUse'), evSeconds(1, 'Stop')], NOW)).toBe(30000);
    expect(liveClockMs([], NOW)).toBe(30000);
  });

  test('ação logo depois de 12 s ainda pede mais um batimento para apagar o brilho', () => {
    expect(liveClockMs([evSeconds(12.5, 'PostToolUse')], NOW)).toBe(1000);
    expect(liveClockMs([evSeconds(14, 'PostToolUse')], NOW)).toBe(30000);
  });
});
