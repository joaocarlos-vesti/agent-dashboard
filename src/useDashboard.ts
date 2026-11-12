import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { BROWSER_TIME_ZONE } from './config';
import { supabaseEventSource } from './eventSource';
import { localDay } from './lib/day';
import { loadDayEvents, loadSessionEvents, mergeEvents } from './lib/queries';
import type { Access } from './lib/screen-state';
import type { AgentEvent } from './lib/types';

export type { Access };

const CLOCK_TICK_MS = 30000;
const SUBSCRIBE_TIMEOUT_MS = 10000;

interface PastDay { day: string; events: AgentEvent[]; error: string | null }

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'erro desconhecido');

/** `viewedDay` (AAAA-MM-DD no fuso do navegador); sem ele, o dia de hoje. Hoje fica sempre carregado: quem espera você é de agora, mesmo olhando outro dia. */
export function useDashboard(viewedDay?: string) {
  const [authSession, setAuthSession] = useState<AuthSession | null | undefined>(undefined);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [todayEvents, setTodayEvents] = useState<AgentEvent[]>([]);
  const [isTodayLoaded, setIsTodayLoaded] = useState(false);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [pastDay, setPastDay] = useState<PastDay | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isLive, setIsLive] = useState(true);
  const latestLoad = useRef(0);
  const knownSessions = useRef(new Set<string>());
  const sessionHistories = useRef(new Map<string, Promise<AgentEvent[]>>());
  const [now, setNow] = useState(() => Date.now());
  const userId = authSession?.user.id;
  const todayKey = localDay(now, BROWSER_TIME_ZONE);
  const isPastView = viewedDay !== undefined && viewedDay < todayKey;

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_authEvent, nextSession) => setAuthSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    setIsMember(null);
    void supabase.rpc('is_member').then(({ data: hasAccess }) => setIsMember(hasAccess === true));
  }, [userId]);

  const loadToday = useCallback(async () => {
    const loadId = ++latestLoad.current;
    try {
      const dayEvents = await loadDayEvents(supabaseEventSource, localDay(Date.now(), BROWSER_TIME_ZONE), BROWSER_TIME_ZONE);
      if (loadId !== latestLoad.current) return;
      knownSessions.current = new Set(dayEvents.map((event) => event.session_id));
      setTodayEvents(dayEvents);
      setIsTodayLoaded(true);
      setTodayError(null);
      setLastUpdateAt(Date.now());
    } catch (error) {
      if (loadId === latestLoad.current) setTodayError(errorText(error));
    }
  }, []);

  useEffect(() => {
    if (!isMember || !viewedDay || !isPastView) return;
    let cancelled = false;
    loadDayEvents(supabaseEventSource, viewedDay, BROWSER_TIME_ZONE)
      .then((events) => !cancelled && setPastDay({ day: viewedDay, events, error: null }))
      .catch((error: unknown) => !cancelled && setPastDay({ day: viewedDay, events: [], error: errorText(error) }));
    return () => { cancelled = true; };
  }, [isMember, viewedDay, isPastView, retryCount]);

  // Evento ao vivo de sessão que a tela não tem: busca o resto da sessão antes de mostrar, senão o início, os tokens e as marcas de dia saem errados.
  const showLiveEvent = useCallback(async (insertedEvent: AgentEvent) => {
    const { session_id: sessionId } = insertedEvent;
    let history = sessionHistories.current.get(sessionId);
    if (!history && !knownSessions.current.has(sessionId)) {
      knownSessions.current.add(sessionId);
      history = loadSessionEvents(supabaseEventSource, sessionId).catch((error: unknown) => {
        console.error('Não foi possível carregar o início da sessão; o evento aparece sozinho até a próxima carga.', error);
        knownSessions.current.delete(sessionId);
        return [];
      });
      sessionHistories.current.set(sessionId, history);
      void history.then(() => sessionHistories.current.delete(sessionId));
    }
    const sessionHistory = history ? await history : [];
    setTodayEvents((current) => mergeEvents(current, [...sessionHistory, insertedEvent]));
    setLastUpdateAt(Date.now());
  }, []);

  useEffect(() => {
    if (!isMember) return;
    // A carga não espera o canal ao vivo: se o websocket falhar, o dia aparece e o aviso de conexão fica ligado.
    void loadToday();
    // Canal que fica só tentando conectar não dá erro: sem resposta em 10 s, o cabeçalho deixa de dizer "Ao vivo".
    const subscribeTimeout = setTimeout(() => setIsLive(false), SUBSCRIBE_TIMEOUT_MS);
    const channel = supabase.channel('events')
      .on<AgentEvent>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, ({ new: insertedEvent }) => void showLiveEvent(insertedEvent))
      .subscribe((channelStatus) => {
        setIsLive(channelStatus === 'SUBSCRIBED');
        if (channelStatus === 'SUBSCRIBED') {
          clearTimeout(subscribeTimeout);
          void loadToday();
        }
      });
    const clock = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => {
      clearInterval(clock);
      clearTimeout(subscribeTimeout);
      void supabase.removeChannel(channel);
    };
  }, [isMember, loadToday, showLiveEvent]);

  const retry = useCallback(() => {
    setRetryCount((count) => count + 1);
    void loadToday();
  }, [loadToday]);

  const shownPastDay = pastDay?.day === viewedDay ? pastDay : null;
  const access: Access = authSession === undefined ? 'loading' : !authSession ? 'signed_out' : isMember === null ? 'loading' : isMember ? 'member' : 'no_access';
  const signIn = () => supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } });
  const signOut = () => supabase.auth.signOut();
  const userName: string | null = authSession?.user.user_metadata.user_name ?? null;

  return {
    access, userName, isLive, now, lastUpdateAt, todayEvents, retry, signIn, signOut,
    events: isPastView ? shownPastDay?.events ?? [] : todayEvents,
    isLoadingDay: isPastView ? shownPastDay === null : !isTodayLoaded && todayError === null,
    historyError: isPastView ? shownPastDay?.error ?? null : todayError,
  };
}
