import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { SUPABASE_URL } from '../config';
import { fetchConnectionStatus, generateConnectionKey } from '../eventSource';
import { connectReducer, connectView, initialConnectState, type ConnectAction } from '../lib/connect-flow';

const NETWORK_HOST = new URL(SUPABASE_URL).host;

/** A tela só consulta ao abrir; a chave nova sai do clique, nunca de um efeito (o modo estrito do React roda efeitos duas vezes). */
export function useConnectPanel() {
  const [state, dispatch] = useReducer(connectReducer, initialConnectState);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const isGenerating = useRef(false);

  useEffect(() => {
    let isCurrent = true;
    fetchConnectionStatus()
      .then((status) => isCurrent && dispatch({ type: 'statusLoaded', status }))
      .catch((error: unknown) => isCurrent && dispatch({ type: 'statusFailed', message: error instanceof Error ? error.message : 'erro desconhecido' }));
    return () => { isCurrent = false; };
  }, [statusAttempt]);

  const generateKey = useCallback(async () => {
    if (isGenerating.current) return;
    isGenerating.current = true;
    try {
      dispatch({ type: 'generated', key: await generateConnectionKey() });
    } catch {
      dispatch({ type: 'generateFailed' });
    } finally {
      isGenerating.current = false;
    }
  }, []);

  // Quem decide se vai gerar é o reducer; aqui só se dispara a chamada quando o passo vira "generating".
  const advance = useCallback((action: ConnectAction) => {
    dispatch(action);
    if (state.step.kind !== 'generating' && connectReducer(state, action).step.kind === 'generating') void generateKey();
  }, [state, generateKey]);

  const requestNew = useCallback(() => advance({ type: 'requestNew' }), [advance]);
  const confirm = useCallback(() => advance({ type: 'confirm' }), [advance]);

  const copyCommand = useCallback(async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      dispatch({ type: 'copied' });
    } catch {
      // Sem permissão para copiar: o comando continua na tela para copiar à mão.
    }
  }, []);

  const view = connectView(state, { now: Date.now(), origin: window.location.origin, networkHost: NETWORK_HOST, timeZone: undefined });
  const retryStatus = () => {
    dispatch({ type: 'retryStatus' });
    setStatusAttempt((attempt) => attempt + 1);
  };

  return { view, requestNew, confirm, cancel: () => dispatch({ type: 'cancel' }), retryStatus, copyCommand };
}
