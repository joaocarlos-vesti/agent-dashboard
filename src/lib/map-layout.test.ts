import { describe, expect, it } from 'vitest';
import { edgeLineOf, layoutMap, ORB_CENTER_Y } from './map-layout';
import type { VisibleItem } from './map-tree';

const node = (id: string, parentId: string | null, nodeKind: 'session' | 'workflow' | 'agent'): VisibleItem => ({ kind: 'node', id, parentId, nodeKind });
const items: VisibleItem[] = [
  node('s1', null, 'session'),
  node('a1', 's1', 'agent'),
  node('a2', 's1', 'agent'),
  node('s2', null, 'session'),
];
const heights = { s1: 96, a1: 100, a2: 80, s2: 96 };
const layout = (overrides = {}) => layoutMap({ items, heights, edgeLines: {}, orientation: 'horizontal', ...overrides });

describe('layout horizontal (R77)', () => {
  it('põe cada nível numa coluna, 52 px depois da coluna do pai', () => {
    const { placed } = layout();
    expect(placed.s1).toMatchObject({ x: 0, width: 224 });
    expect(placed.a1).toMatchObject({ x: 224 + 52, width: 256 });
  });

  it('alinha o pai ao topo do primeiro filho e separa irmãos por 10 px', () => {
    const { placed } = layout();
    expect(placed.s1?.y).toBe(placed.a1?.y);
    expect(placed.a2?.y).toBe((placed.a1?.y ?? 0) + 100 + 10);
  });

  it('separa as sessões por 22 px depois do filho mais baixo', () => {
    const { placed } = layout();
    expect(placed.s2?.y).toBe(100 + 10 + 80 + 22);
  });

  it('um pai mais alto que os filhos empurra a sessão seguinte', () => {
    const { placed } = layout({ heights: { ...heights, s1: 300 } });
    expect(placed.s2?.y).toBe(300 + 22);
  });

  it('usa uma altura padrão enquanto o card ainda não foi medido', () => {
    const { placed } = layout({ heights: {} });
    expect(placed.a2?.y).toBeGreaterThan(placed.a1?.y ?? 0);
  });

  it('desenha a curva do centro do ícone do pai até a borda do filho', () => {
    const { edges } = layout();
    const edge = edges.find((candidate) => candidate.targetId === 'a1');
    const x1 = 224;
    const x2 = 224 + 52 + 8;
    const mid = Math.round((x1 + (x2 - x1) * 0.55) * 10) / 10;
    expect(edge?.path).toBe(`M${x1} ${ORB_CENTER_Y} C${mid} ${ORB_CENTER_Y} ${mid} ${ORB_CENTER_Y} ${x2} ${ORB_CENTER_Y}`);
  });

  it('não liga sessões nem grupos a ninguém', () => {
    expect(layout().edges.map((edge) => edge.targetId)).toEqual(['a1', 'a2']);
  });

  it('a linha de cada ligação vem do estado do filho; sem estado, parada', () => {
    const { edges } = layout({ edgeLines: { a1: 'flow' } });
    expect(edges.map((edge) => edge.line)).toEqual(['flow', 'idle']);
  });

  it('o "N concluídos · mostrar" é um item de 256 px com a linha pontilhada própria', () => {
    const withMore: VisibleItem[] = [node('w1', null, 'workflow'), { kind: 'more', id: 'more::w1', parentId: 'w1', workflowId: 'w1', label: '3 concluídos · mostrar' }];
    const { placed, edges } = layoutMap({ items: withMore, heights: {}, edgeLines: {}, orientation: 'horizontal' });
    expect(placed['more::w1']?.width).toBe(256);
    expect(edges[0]?.line).toBe('more');
  });

  it('o botão de grupo recolhido fica na coluna da raiz, depois das sessões', () => {
    const withGroup: VisibleItem[] = [...items, { kind: 'group', id: 'group::endedToday', parentId: null, group: 'endedToday', label: 'Encerradas hoje (1)', open: false }];
    const { placed } = layoutMap({ items: withGroup, heights: { ...heights, 'group::endedToday': 32 }, edgeLines: {}, orientation: 'horizontal' });
    expect(placed['group::endedToday']).toMatchObject({ x: 0 });
    expect(placed['group::endedToday']?.y).toBe((placed.s2?.y ?? 0) + 96 + 22);
  });

  it('informa o tamanho total do mapa', () => {
    const { width, height } = layout();
    expect(width).toBe(224 + 52 + 256);
    expect(height).toBe(100 + 10 + 80 + 22 + 96);
  });
});

describe('layout vertical (árvore para tela estreita)', () => {
  const vertical = (overrides = {}) => layout({ orientation: 'vertical', availableWidth: 400, ...overrides });

  it('recua 44 px por nível, ocupa a largura que sobra e põe o filho abaixo do pai', () => {
    const { placed } = vertical();
    expect(placed.s1).toMatchObject({ x: 0, y: 0, width: 400 });
    expect(placed.a1).toMatchObject({ x: 44, y: 96 + 10, width: 356 });
    expect(placed.a2?.y).toBe(96 + 10 + 100 + 8);
  });

  it('faz a ligação em L: desce do ícone do pai e dobra para o filho', () => {
    const edge = vertical().edges.find((candidate) => candidate.targetId === 'a1');
    const bottomOfOrb = 12 + 30 + 4;
    expect(edge?.path).toBe(`M27 ${bottomOfOrb} L27 ${96 + 10 + ORB_CENTER_Y - 12} Q27 ${96 + 10 + ORB_CENTER_Y} 39 ${96 + 10 + ORB_CENTER_Y} L52 ${96 + 10 + ORB_CENTER_Y}`);
  });
});

describe('estado da linha (R76)', () => {
  const base = { status: 'running', lit: false, inEndedSession: false, frozen: false };

  it('agindo: fluxo; rodando sem agir: tracejada; parado: cinza', () => {
    expect(edgeLineOf({ ...base, lit: true })).toBe('flow');
    expect(edgeLineOf(base)).toBe('dashed');
    expect(edgeLineOf({ ...base, status: 'done' })).toBe('idle');
  });

  it('sem sinal: pontilhada', () => {
    expect(edgeLineOf({ ...base, status: 'stale' })).toBe('dotted');
  });

  it('dentro de sessão encerrada: apagada, mesmo que algo ainda pareça aceso', () => {
    expect(edgeLineOf({ ...base, lit: true, inEndedSession: true })).toBe('ended');
  });

  it('dia passado: nada flui', () => {
    expect(edgeLineOf({ ...base, lit: true, frozen: true })).toBe('dashed');
    expect(edgeLineOf({ ...base, status: 'done', lit: true, frozen: true })).toBe('idle');
  });
});
