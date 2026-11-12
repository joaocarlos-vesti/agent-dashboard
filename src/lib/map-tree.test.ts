import { describe, expect, test } from 'vitest';
import {
  agentAction, ev, boardOf, looseAgentStart, looseAgentStop, sessionStart, workflowAgentStart, workflowAgentStop, workflowStart,
} from './test-fixtures';
import { buildMapTree, isNodeOpen, nodesWithChildren, resolveNodeId, revealPathOf, visibleItems } from './map-tree';
import { initialUiState } from './ui-state';
import type { AgentEvent, BoardOptions } from './types';

const ui = () => initialUiState({ today: '2026-11-12', helpSeen: true });
const treeOf = (events: AgentEvent[], options: BoardOptions = {}, pastDay = false) => buildMapTree(boardOf(events, options), { pastDay });
const idsOf = (events: AgentEvent[], state = ui(), pastDay = false) => {
  const tree = treeOf(events, {}, pastDay);
  return visibleItems(tree, state).map((item) => item.id);
};

// Sessão com um workflow de dois agentes e dois avulsos do mesmo tipo.
const richSession = [
  sessionStart(60),
  workflowStart(50),
  workflowAgentStart(49, 'w-a1'), workflowAgentStart(48, 'w-a2'),
  looseAgentStart(30, 'l1'), looseAgentStart(20, 'l2'),
  agentAction(1, 'l2'),
];

describe('árvore do mapa', () => {
  test('sessão, workflow e agentes viram nós com pais e filhos', () => {
    const tree = treeOf(richSession);
    const sessionNode = tree.nodes['s1'];
    expect(sessionNode?.kind).toBe('session');
    const kinds = sessionNode?.childIds.map((id) => tree.nodes[id]?.kind);
    expect(kinds).toEqual(['workflow', 'agent']);
    const workflowNode = tree.nodes[sessionNode?.childIds[0] ?? ''];
    expect(workflowNode?.childIds).toEqual(['w-a1', 'w-a2']);
    expect(tree.nodes['w-a1']?.parentId).toBe(workflowNode?.id);
  });

  test('um card por tipo de agente avulso, com todas as chamadas', () => {
    const tree = treeOf(richSession);
    const looseNode = Object.values(tree.nodes).find((node) => node.kind === 'agent' && node.unit.agentIds.includes('l1'));
    expect(looseNode?.kind === 'agent' && looseNode.unit).toMatchObject({ label: 'logic-reviewer', callCount: 2, agentIds: ['l1', 'l2'], status: 'running' });
  });

  test('o id de um agente avulso resolve para o card do tipo dele', () => {
    const tree = treeOf(richSession);
    const looseNodeId = tree.nodeIdOfAgent['l2'];
    expect(looseNodeId).toBeDefined();
    expect(resolveNodeId(tree, 'l1')).toBe(looseNodeId);
    expect(resolveNodeId(tree, 'w-a1')).toBe('w-a1');
    expect(resolveNodeId(tree, 's1')).toBe('s1');
    expect(resolveNodeId(tree, 'nao-existe')).toBeNull();
  });

  test('ordem dos filhos segue a hora de início, não os tokens', () => {
    const events = [
      sessionStart(60),
      looseAgentStart(50, 'x1', 'Explore'), looseAgentStart(40, 'g1', 'general-purpose'),
      looseAgentStop(30, 'g1', 'general-purpose', { input_tokens: 90000 }), looseAgentStop(20, 'x1', 'Explore', { input_tokens: 10 }),
    ];
    const tree = treeOf(events);
    const labels = tree.nodes['s1']?.childIds.map((id) => { const node = tree.nodes[id]; return node?.kind === 'agent' ? node.unit.label : ''; });
    expect(labels).toEqual(['Explore', 'general-purpose']);
  });

  test('card do agente de workflow é uma chamada; a marca de provável mesmo agente vem do grupo', () => {
    const task = 'Review the coupon discount logic in checkout and report blocking issues';
    const events = [
      sessionStart(60), workflowStart(50),
      workflowAgentStart(49, 'a1'), workflowAgentStart(48, 'a2'),
      workflowAgentStop(40, 'a1', { task }), workflowAgentStop(39, 'a2', { task }),
    ];
    const tree = treeOf(events);
    const [first, second] = ['a1', 'a2'].map((id) => tree.nodes[id]);
    expect(first?.kind === 'agent' && [first.unit.callCount, first.unit.probableSameAgent, first.unit.summary.callCount]).toEqual([1, true, 2]);
    expect(second?.kind === 'agent' && second.unit.label).toBe('Review the coupon discount');
  });
});

describe('o que aparece (R47, R49, R51, R82)', () => {
  test('sessão aberta mostra os filhos; sessão encerrada vem recolhida', () => {
    const ended = [sessionStart(60), ev(50, 'SubagentStart', { agent_id: 'x', agent_type: 'Explore' }), ev(40, 'SessionEnd')];
    expect(idsOf(richSession)).toContain('w-a1');
    const tree = treeOf(ended);
    expect(isNodeOpen(tree, 's1', {})).toBe(false);
    expect(isNodeOpen(tree, 's1', { s1: true })).toBe(true);
  });

  test('o clique do usuário vale mais que o padrão', () => {
    const tree = treeOf(richSession);
    expect(isNodeOpen(tree, 's1', {})).toBe(true);
    expect(isNodeOpen(tree, 's1', { s1: false })).toBe(false);
  });

  test('card recolhido esconde os descendentes', () => {
    const tree = treeOf(richSession);
    const ids = visibleItems(tree, { ...ui(), nodeOpen: { s1: false } }).map((item) => item.id);
    expect(ids).toEqual(['s1']);
  });

  test('workflow com mais de 6 agentes esconde os concluídos atrás de "N concluídos · mostrar"', () => {
    const agents = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
    const events = [
      sessionStart(90), workflowStart(80),
      ...agents.map((id, index) => workflowAgentStart(70 - index, id)),
      ...['a1', 'a2', 'a3'].map((id, index) => workflowAgentStop(40 - index, id)),
    ];
    const tree = treeOf(events);
    const items = visibleItems(tree, ui());
    const more = items.find((item) => item.kind === 'more');
    expect(more).toMatchObject({ label: '3 concluídos · mostrar', parentId: tree.nodes['s1']?.childIds[0] });
    expect(items.filter((item) => item.kind === 'node' && item.nodeKind === 'agent').map((item) => item.id)).toEqual(['a4', 'a5', 'a6', 'a7']);
    const workflowId = tree.nodes['s1']?.childIds[0] ?? '';
    const expanded = visibleItems(tree, { ...ui(), expandedWorkflows: [workflowId] });
    expect(expanded.some((item) => item.kind === 'more')).toBe(false);
    expect(expanded.filter((item) => item.kind === 'node' && item.nodeKind === 'agent')).toHaveLength(7);
  });

  test('workflow com 6 agentes mostra todos', () => {
    const agents = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
    const events = [
      sessionStart(90), workflowStart(80),
      ...agents.map((id, index) => workflowAgentStart(70 - index, id)),
      ...agents.slice(0, 5).map((id, index) => workflowAgentStop(40 - index, id)),
    ];
    expect(visibleItems(treeOf(events), ui()).some((item) => item.kind === 'more')).toBe(false);
  });

  test('sessões encerradas ficam atrás de "Encerradas hoje (N)" e abrem ao clicar', () => {
    const endedSession = (sessionId: string) => [
      { ...sessionStart(60), session_id: sessionId }, { ...ev(50, 'SessionEnd'), session_id: sessionId },
    ];
    const events = [...richSession, ...endedSession('e1'), ...endedSession('e2')];
    const tree = treeOf(events);
    const closed = visibleItems(tree, ui());
    expect(closed.find((item) => item.kind === 'group')).toMatchObject({ id: 'group::endedToday', label: 'Encerradas hoje (2)', open: false });
    expect(closed.some((item) => item.id === 'e1')).toBe(false);
    const open = visibleItems(tree, { ...ui(), openGroups: { endedToday: true, openIdle: false } });
    expect(open.some((item) => item.id === 'e1')).toBe(true);
    expect(open.find((item) => item.kind === 'group')).toMatchObject({ open: true });
  });

  test('sessão aberta sem atividade hoje vai para "Abertas, sem atividade hoje (N)"', () => {
    const yesterdayStop = { ...ev(0, 'Stop'), created_at: '2026-11-11T22:00:00Z' };
    const tree = treeOf([{ ...sessionStart(0), created_at: '2026-11-11T21:00:00Z' }, yesterdayStop, { ...ev(0, 'SessionStart'), session_id: 's2', created_at: '2026-11-12T11:50:00Z' }]);
    const group = visibleItems(tree, ui()).find((item) => item.kind === 'group');
    expect(group).toMatchObject({ id: 'group::openIdle', label: 'Abertas, sem atividade hoje (1)' });
  });

  test('dia passado mostra todas as sessões na lista, sem grupos recolhidos', () => {
    const ended = [sessionStart(60), ev(50, 'SessionEnd')];
    const ids = idsOf(ended, ui(), true);
    expect(ids).toEqual(['s1']);
    expect(isNodeOpen(treeOf(ended, {}, true), 's1', {})).toBe(true);
  });

  test('pai fica antes dos filhos e nada muda de lugar quando o estado muda', () => {
    const before = idsOf(richSession);
    const after = idsOf([...richSession, looseAgentStop(0.5, 'l1')]);
    expect(after).toEqual(before);
  });
});

describe('revelar um item (faixa e botão âmbar)', () => {
  test('agente dentro de workflow grande revela pais e concluídos', () => {
    const agents = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
    const events = [
      sessionStart(90), workflowStart(80),
      ...agents.map((id, index) => workflowAgentStart(70 - index, id)),
      workflowAgentStop(40, 'a1', { summary: 'VEREDITO: REPROVADO — falta teste' }), workflowAgentStop(39, 'a2'),
    ];
    const tree = treeOf(events);
    const workflowId = tree.nodes['s1']?.childIds[0] ?? '';
    expect(revealPathOf(tree, 'a2')).toEqual({ ancestorIds: ['s1', workflowId], group: null, workflowId });
    expect(revealPathOf(tree, 'a7')).toEqual({ ancestorIds: ['s1', workflowId], group: null, workflowId: null });
  });

  test('sessão encerrada revela o grupo recolhido', () => {
    const tree = treeOf([...richSession, { ...sessionStart(60), session_id: 'e1' }, { ...ev(50, 'SessionEnd'), session_id: 'e1' }]);
    expect(revealPathOf(tree, 'e1')).toEqual({ ancestorIds: [], group: 'endedToday', workflowId: null });
  });

  test('id desconhecido não revela nada', () => {
    expect(revealPathOf(treeOf(richSession), 'x')).toBeNull();
  });

  test('lista os cards que têm filhos para o "Recolher tudo"', () => {
    const tree = treeOf(richSession);
    const workflowId = tree.nodes['s1']?.childIds[0] ?? '';
    expect(nodesWithChildren(tree).sort()).toEqual(['s1', workflowId].sort());
  });
});
