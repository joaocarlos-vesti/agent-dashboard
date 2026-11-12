import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { supabaseEventSource } from './eventSource';
import { localDay } from './lib/day';
import { loadDayEvents, loadSessionEvents, mergeEvents } from './lib/queries';
import type { AgentEvent } from './lib/types';

export type Access = 'loading' | 'signed_out' | 'no_access' | 'member';

const BROWSER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const CLOCK_TICK_MS = 30000;

/** `viewedDay` (AAAA-MM-DD no fuso do navegador); sem ele, o dia de hoje. */
export function useDashboard(viewedDay?: string) {
  const [authSession, setAuthSession] = useState<AuthSession | null | undefined>(undefined);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const latestLoad = useRef(0);
  const knownSessions = useRef(new Set<string>());
  const sessionHistories = useRef(new Map<string, Promise<AgentEvent[]>>());
  const [now, setNow] = useState(() => Date.now());
  const userId = authSession?.user.id;

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_authEvent, nextSession) => setAuthSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    setIsMember(null);
    void supabase.rpc('is_member').then(({ data: hasAccess }) => setIsMember(hasAccess === true));
  }, [userId]);

  const loadHistory = useCallback(async () => {
    const loadId = ++latestLoad.current;
    try {
      const dayEvents = await loadDayEvents(supabaseEventSource, viewedDay ?? localDay(Date.now(), BROWSER_TIME_ZONE), BROWSER_TIME_ZONE);
      if (loadId !== latestLoad.current) return;
      knownSessions.current = new Set(dayEvents.map((event) => event.session_id));
      setEvents(dayEvents);
      setHistoryError(null);
    } catch (error) {
      if (loadId === latestLoad.current) setHistoryError(error instanceof Error ? error.message : 'erro desconhecido');
    }
  }, [viewedDay]);

  // Evento ao vivo de sessão que a tela não tem: busca o resto da sessão antes de mostrar, senão o início, os tokens e as marcas de dia saem errados.
  const showLiveEvent = useCallback(async (insertedEvent: AgentEvent) => {
    if (viewedDay && viewedDay !== localDay(Date.now(), BROWSER_TIME_ZONE)) return;
    const { session_id: sessionId } = insertedEvent;
    let history = sessionHistories.current.get(sessionId);
    if (!history && !knownSessions.current.has(sessionId)) {
      knownSessions.current.add(sessionId);
      history = loadSessionEvents(supabaseEventSource, sessionId).catch(() => {
        knownSessions.current.delete(sessionId);
        return [];
      });
      sessionHistories.current.set(sessionId, history);
      void history.then(() => sessionHistories.current.delete(sessionId));
    }
    const sessionHistory = history ? await history : [];
    setEvents((current) => mergeEvents(current, [...sessionHistory, insertedEvent]));
  }, [viewedDay]);

  useEffect(() => {
    if (!isMember) return;
    const channel = supabase.channel('events')
      .on<AgentEvent>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, ({ new: insertedEvent }) => void showLiveEvent(insertedEvent))
      .subscribe((channelStatus) => {
        setIsLive(channelStatus === 'SUBSCRIBED');
        if (channelStatus === 'SUBSCRIBED') void loadHistory();
      });
    const clock = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => {
      clearInterval(clock);
      void supabase.removeChannel(channel);
    };
  }, [isMember, loadHistory, showLiveEvent]);

  const access: Access = authSession === undefined ? 'loading' : !authSession ? 'signed_out' : isMember === null ? 'loading' : isMember ? 'member' : 'no_access';
  const signIn = () => supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } });
  const signOut = () => supabase.auth.signOut();
  const userName: string | null = authSession?.user.user_metadata.user_name ?? null;

  return { access, userName, events, isLive, historyError, now, signIn, signOut };
}
