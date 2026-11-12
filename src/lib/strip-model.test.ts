import { describe, expect, test } from 'vitest';
import { NOW, UTC, agentAction, boardOf, ev, looseAgentStart, looseAgentStop, sessionStart, workflowAgentStart, workflowAgentStop, workflowStart } from './test-fixtures';
import { attentionItems } from './attention';
import { buildMapTree } from './map-tree';
import { stripModel } from './strip-model';
import type { AgentEvent } from './types';

function stripOf(events: AgentEvent[], pastDay = false) {
  const board = boardOf(events);
  const tree = buildMapTree(board, { pastDay });
  return stripModel({ items: attentionItems(board, NOW), tree, now: NOW, timeZone: UTC, pastDay });
}
const permission = (minutesAgo: number, session = 's1') => ev(minutesAgo, 'Notification', { session_id: session, summary: 'permission_prompt: Claude needs your permission to use Bash' });

describe('faixa de atenção (T19, T20)', () => {
  test('T19: sem nada que peça ação, diz que está tudo certo', () => {
    expect(stripOf([sessionStart(5), ev(0, 'PreToolUse', { tool: 'Read' })])).toEqual({ headline: 'Tudo certo: ninguém esperando você, nada reprovado ou parado.', chips: [] });
  });

  test('T20: um botão por fato, quem aguarda você primeiro e em âmbar', () => {
    const events = [
      sessionStart(40, { session_id: 's1' }), permission(6),
      sessionStart(30, { session_id: 's2', cwd: '/home/joao/api' }), ev(3, 'Stop', { session_id: 's2' }),
    ];
    const { headline, chips } = stripOf(events);
    expect(headline).toBeNull();
    expect(chips.map((chip) => [chip.name, chip.fact, chip.tone, chip.icon])).toEqual([
      ['loja-web', 'aguardando você há 6 min', 'waiting', 'waiting'],
      ['api', 'terminou há 3 min', 'yourTurn', 'yourTurn'],
    ]);
  });

  test('reprovado e sem nova ação são fatos de alerta e apontam para o card do agente', () => {
    const events = [
      sessionStart(60), workflowStart(50), workflowAgentStart(49, 'a1'), workflowAgentStart(48, 'a2'),
      workflowAgentStop(30, 'a1', { summary: 'REPROVADO: faltou teste' }), agentAction(20, 'a2'), ev(0, 'PreToolUse', { tool: 'Read' }),
    ];
    const { chips } = stripOf(events);
    expect(chips.map((chip) => [chip.kind, chip.tone, chip.nodeId])).toEqual([['rejected', 'alert', 'a1'], ['silent', 'alert', 'a2']]);
    expect(chips[0]?.fact).toBe('REPROVADO: faltou teste');
  });

  test('o botão de um agente avulso leva ao card do tipo dele e abre os pais', () => {
    const events = [sessionStart(60), looseAgentStart(10, 'l1'), looseAgentStop(5, 'l1', 'logic-reviewer', { summary: 'REPROVADO: sem teste' }), ev(0, 'PreToolUse', { tool: 'Read' })];
    const [chip] = stripOf(events).chips;
    expect([chip?.name, chip?.nodeId, chip?.reveal]).toEqual(['logic-reviewer', 's1::agents::logic-reviewer', { ancestorIds: ['s1'], group: null, workflowId: null }]);
  });

  test('em dia passado, quem espera você não entra na faixa (isso vai para o botão do topo)', () => {
    const events = [sessionStart(40), permission(6)];
    expect(stripOf(events, true).chips).toEqual([]);
  });
});
