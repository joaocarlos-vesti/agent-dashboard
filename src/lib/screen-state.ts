export type Access = 'loading' | 'signed_out' | 'no_access' | 'member';

export interface ScreenInput {
  access: Access;
  isLoadingDay: boolean;
  historyError: string | null;
  hasSessions: boolean;
  pastDay: boolean;
}

export type ScreenState =
  | { kind: 'ready' }
  | { kind: 'loading'; title: string }
  | { kind: 'error'; title: string; action: string }
  | { kind: 'empty'; title: string; hint: string | null }
  | { kind: 'signedOut'; title: string; action: string }
  | { kind: 'noAccess'; title: string };

const LOADING_TEXT = 'Carregando suas sessões…';
const SIGNED_OUT_TEXT = 'Entre com a sua conta do GitHub para ver o painel.';
const NO_ACCESS_TEXT = 'Seu usuário ainda não tem acesso. Peça para alguém do time incluir você.';

/** O que a tela inteira mostra: carregando, erro, vazio, login, sem acesso, ou o mapa. */
export function screenState({ access, isLoadingDay, historyError, hasSessions, pastDay }: ScreenInput): ScreenState {
  if (access === 'signed_out') return { kind: 'signedOut', title: SIGNED_OUT_TEXT, action: 'Entrar com GitHub' };
  if (access === 'no_access') return { kind: 'noAccess', title: NO_ACCESS_TEXT };
  if (access === 'loading' || isLoadingDay) return { kind: 'loading', title: LOADING_TEXT };
  if (hasSessions) return { kind: 'ready' };
  if (historyError) return { kind: 'error', title: `Não foi possível carregar suas sessões: ${historyError}. Confira a internet e clique em Tentar de novo.`, action: 'Tentar de novo' };
  return pastDay
    ? { kind: 'empty', title: 'Nenhuma sessão neste dia.', hint: null }
    : { kind: 'empty', title: 'Nenhuma sessão do Claude Code neste dia.', hint: 'Ainda não conectou? Clique em Conectar meu Claude Code no topo.' };
}
