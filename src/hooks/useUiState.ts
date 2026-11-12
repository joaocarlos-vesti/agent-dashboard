import { useEffect, useReducer, type Dispatch } from 'react';
import { initialUiState, uiReducer, type UiAction, type UiState } from '../lib/ui-state';

const HELP_SEEN_KEY = 'painel-agentes:como-ler-visto';

function readHelpSeen(): boolean {
  try {
    return window.localStorage.getItem(HELP_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHelpSeen(): void {
  try {
    window.localStorage.setItem(HELP_SEEN_KEY, '1');
  } catch {
    // Sem armazenamento (aba privada): o "Como ler" volta a abrir na próxima visita.
  }
}

/** Estado da interface (dia, seleção, mostrador, grupos abertos); o "Como ler" lembra no navegador que já foi visto. */
export function useUiState(today: string): [UiState, Dispatch<UiAction>] {
  const [state, dispatch] = useReducer(uiReducer, undefined, () => initialUiState({ today, helpSeen: readHelpSeen() }));

  useEffect(() => dispatch({ type: 'setToday', today }), [today]);
  useEffect(() => {
    if (state.helpSeen) writeHelpSeen();
  }, [state.helpSeen]);
  useEffect(() => {
    const closeOnEscape = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') dispatch({ type: 'escape' });
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  return [state, dispatch];
}
