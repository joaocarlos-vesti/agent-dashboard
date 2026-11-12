import { describe, expect, test } from 'vitest';
import { NOW, UTC, boardOf, ev, evSeconds, looseAgentStart, looseAgentStop, sessionStart, workflowAgentStart, workflowAgentStop, workflowStart } from './test-fixtures';
import { buildMapScene, type MapScene } from './map-scene';
import { initialUiState } from './ui-state';
import type { AgentEvent } from './types';

const ui = initialUiState({ today: '2026-11-12', helpSeen: true });

function sceneOf(events: AgentEvent[], { pastDay = false, uiState = ui } = {}): MapScene {
  return buildMapScene({ board: boardOf(events), ui: uiState, now: NOW, timeZone: UTC, pastDay });
}
const activeAgent = (id: string) => evSeconds(3, 'PostToolUse', { agent_id: id, agent_type: 'logic-reviewer', tool: 'Read', summary: 'a.ts' });

describe('cena do mapa', () => {
  test('um card pronto para cada item visível, na ordem do mapa', () => {
    const scene = sceneOf([sessionStart(40), looseAgentStart(20, 'l1'), ev(0, 'PreToolUse', { tool: 'Read' })]);
    expect(scene.hasSessions).toBe(true);
    expect(scene.items.map((item) => item.id)).toEqual(['s1', 's1::agents::logic-reviewer']);
    expect(Object.keys(scene.cards)).toEqual(['s1', 's1::agents::logic-reviewer']);
    expect(scene.cards.s1?.open).toBe(true);
  });

  test('sem eventos, não há sessões', () => {
    expect(sceneOf([]).hasSessions).toBe(false);
  });

  test('R76: a linha de cada agente segue o estado dele', () => {
    const events = [
      sessionStart(60), workflowStart(50), workflowAgentStart(49, 'a1'), workflowAgentStart(48, 'a2'), workflowAgentStart(47, 'a3'), workflowAgentStop(30, 'a1'),
      activeAgent('a2'), ev(0, 'PreToolUse', { tool: 'Read' }),
    ];
    const { edgeLines } = sceneOf(events);
    expect([edgeLines['s1::wf::wf_1'], edgeLines.a1, edgeLines.a2, edgeLines.a3]).toEqual(['flow', 'idle', 'flow', 'dashed']);
  });

  test('dia passado: nenhuma linha flui', () => {
    const events = [sessionStart(60), looseAgentStart(20, 'l1'), activeAgent('l1'), ev(0, 'Stop')];
    expect(sceneOf(events, { pastDay: true }).edgeLines['s1::agents::logic-reviewer']).toBe('dashed');
  });

  test('dentro de uma sessão encerrada as linhas ficam apagadas', () => {
    const open = { ...ui, nodeOpen: { s1: true } };
    const events = [sessionStart(60), looseAgentStart(50, 'l1'), looseAgentStop(40, 'l1'), ev(30, 'SessionEnd'), ev(20, 'SessionStart', { session_id: 's2' })];
    const scene = sceneOf(events, { uiState: { ...open, openGroups: { endedToday: true, openIdle: false } } });
    expect(scene.edgeLines['s1::agents::logic-reviewer']).toBe('ended');
  });

  test('o card respeita o que o dev abriu ou fechou', () => {
    const closed = { ...ui, nodeOpen: { s1: false } };
    const scene = sceneOf([sessionStart(40), looseAgentStart(20, 'l1'), ev(0, 'PreToolUse', { tool: 'Read' })], { uiState: closed });
    expect(scene.items.map((item) => item.id)).toEqual(['s1']);
    expect(scene.cards.s1?.open).toBe(false);
  });
});
