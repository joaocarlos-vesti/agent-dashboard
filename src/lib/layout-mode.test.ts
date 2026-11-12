import { describe, expect, test } from 'vitest';
import { layoutModeFor } from './layout-mode';

describe('largura da tela (T13, T14, T15)', () => {
  test('T13: de 1280 px para cima, mapa e painel lado a lado', () => {
    expect(layoutModeFor(1440)).toEqual({ orientation: 'horizontal', panel: 'fixed' });
    expect(layoutModeFor(1280)).toEqual({ orientation: 'horizontal', panel: 'fixed' });
  });

  test('T14: de 1100 a 1279 px, o painel abre por cima do mapa', () => {
    expect(layoutModeFor(1279)).toEqual({ orientation: 'horizontal', panel: 'overlay' });
    expect(layoutModeFor(1100)).toEqual({ orientation: 'horizontal', panel: 'overlay' });
  });

  test('T15: abaixo de 1100 px, o mapa vira árvore vertical e o painel abre por cima', () => {
    expect(layoutModeFor(1099)).toEqual({ orientation: 'vertical', panel: 'overlay' });
    expect(layoutModeFor(390)).toEqual({ orientation: 'vertical', panel: 'overlay' });
  });
});
