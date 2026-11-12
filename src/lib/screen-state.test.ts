import { describe, expect, test } from 'vitest';
import { screenState, type ScreenInput } from './screen-state';

const input = (overrides: Partial<ScreenInput> = {}): ScreenInput => ({ access: 'member', isLoadingDay: false, historyError: null, hasSessions: true, pastDay: false, ...overrides });

describe('estados da tela inteira', () => {
  test('T1: carregando mostra o esqueleto com a mensagem', () => {
    expect(screenState(input({ isLoadingDay: true, hasSessions: false }))).toEqual({ kind: 'loading', title: 'Carregando suas sessões…' });
  });

  test('T1: enquanto o login e o acesso ainda são conferidos também é "carregando"', () => {
    expect(screenState(input({ access: 'loading', hasSessions: false }))).toMatchObject({ kind: 'loading' });
  });

  test('T2: erro mostra a mensagem do Supabase e o botão de tentar de novo', () => {
    expect(screenState(input({ historyError: 'JWT expired', hasSessions: false }))).toEqual({
      kind: 'error',
      title: 'Não foi possível carregar suas sessões: JWT expired. Confira a internet e clique em Tentar de novo.',
      action: 'Tentar de novo',
    });
  });

  test('T3: vazio hoje explica como conectar', () => {
    expect(screenState(input({ hasSessions: false }))).toEqual({
      kind: 'empty',
      title: 'Nenhuma sessão do Claude Code neste dia.',
      hint: 'Ainda não conectou? Clique em Conectar meu Claude Code no topo.',
    });
  });

  test('T4: vazio em dia passado não pede para conectar', () => {
    expect(screenState(input({ hasSessions: false, pastDay: true }))).toEqual({ kind: 'empty', title: 'Nenhuma sessão neste dia.', hint: null });
  });

  test('T5: com sessões, a tela está pronta', () => {
    expect(screenState(input())).toEqual({ kind: 'ready' });
  });

  test('T6: sem login pede para entrar com o GitHub', () => {
    expect(screenState(input({ access: 'signed_out' }))).toEqual({ kind: 'signedOut', title: 'Entre com a sua conta do GitHub para ver o painel.', action: 'Entrar com GitHub' });
  });

  test('T7: sem acesso pede para falar com o time', () => {
    expect(screenState(input({ access: 'no_access' }))).toEqual({ kind: 'noAccess', title: 'Seu usuário ainda não tem acesso. Peça para alguém do time incluir você.' });
  });

  test('erro vence o vazio, e o carregando vence o erro de uma carga antiga', () => {
    expect(screenState(input({ historyError: 'x', hasSessions: false })).kind).toBe('error');
    expect(screenState(input({ historyError: 'x', hasSessions: false, isLoadingDay: true })).kind).toBe('loading');
  });

  test('erro com sessões já na tela não derruba o mapa', () => {
    expect(screenState(input({ historyError: 'x' }))).toEqual({ kind: 'ready' });
  });
});
