import { useCallback, useEffect, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { AgentEvent } from './lib/types';

export type Access = 'loading' | 'signed_out' | 'no_access' | 'member';

const HISTORY_HOURS = 24;
const HISTORY_LIMIT = 5000;
const CLOCK_TICK_MS = 30000;

export function useDashboard() {
  const [authSession, setAuthSession] = useState<AuthSession | null | undefined>(undefined);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [historyFailed, setHistoryFailed] = useState(false);
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
    const since = new Date(Date.now() - HISTORY_HOURS * 3600000).toISOString();
    const { data: recentEvents, error } = await supabase.from('events').select('*').gte('created_at', since).order('id').limit(HISTORY_LIMIT);
    setHistoryFailed(Boolean(error));
    if (!error) setEvents(recentEvents);
  }, []);

  useEffect(() => {
    if (!isMember) return;
    const channel = supabase.channel('events')
      .on<AgentEvent>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, ({ new: insertedEvent }) => {
        setEvents((current) => [...current, insertedEvent]);
      })
      .subscribe((channelStatus) => {
        setIsLive(channelStatus === 'SUBSCRIBED');
        if (channelStatus === 'SUBSCRIBED') void loadHistory();
      });
    const clock = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => {
      clearInterval(clock);
      void supabase.removeChannel(channel);
    };
  }, [isMember, loadHistory]);

  const access: Access = authSession === undefined ? 'loading' : !authSession ? 'signed_out' : isMember === null ? 'loading' : isMember ? 'member' : 'no_access';
  const signIn = () => supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: window.location.origin } });
  const signOut = () => supabase.auth.signOut();
  const userName: string | null = authSession?.user.user_metadata.user_name ?? null;

  return { access, userName, events, isLive, historyFailed, now, signIn, signOut, historyHours: HISTORY_HOURS };
}
