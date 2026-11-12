import { supabase } from './supabase';
import type { ConnectionStatus } from './lib/connect-flow';
import type { EventSource, WeekTokensRow } from './lib/queries';
import type { AgentEvent } from './lib/types';

// A chamada real ao Supabase: só encaixa os filtros que a lib/queries monta; não tem regra e não é testada.
export const supabaseEventSource: EventSource = {
  eventsInRange: ({ gte, lt }, { from, to }) =>
    supabase.from('events').select('*').gte('created_at', gte).lt('created_at', lt).order('id').range(from, to).then(({ data, error }) => ({ data: data as AgentEvent[] | null, error })),
  eventsOfSessionsOutside: (sessionIds, { gte, lt }, { from, to }) =>
    supabase.from('events').select('*').in('session_id', sessionIds).or(`created_at.lt."${gte}",created_at.gte."${lt}"`).order('id').range(from, to)
      .then(({ data, error }) => ({ data: data as AgentEvent[] | null, error })),
  openSessionIdsBefore: (before) =>
    supabase.rpc('my_open_sessions', { p_before: before }).then(({ data: sessions, error }) => ({ data: sessions ? sessions.map(({ session_id: sessionId }: { session_id: string }) => sessionId) : null, error })),
};

/** Tokens por dia local dos últimos 7 dias, calculados no banco (a semana não cabe nos eventos de um dia só). */
export async function fetchWeekTokenRows(timeZone: string): Promise<WeekTokensRow[]> {
  const { data: rows, error } = await supabase.rpc('my_week_tokens', { p_time_zone: timeZone });
  if (error) throw new Error(error.message);
  return rows;
}

interface ConnectionStatusRow { has_key: boolean; key_created_at: string | null; last_event_at: string | null }

/** Se o login tem chave e quando chegou o último evento; só lê, não gera nada. */
export async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const { data: rows, error } = await supabase.rpc('my_connection_status');
  if (error) throw new Error(error.message);
  const [row]: ConnectionStatusRow[] = rows;
  return { hasKey: row?.has_key === true, keyCreatedAt: row?.key_created_at ?? null, lastEventAt: row?.last_event_at ?? null };
}

/** Gera a chave nova e desliga a anterior. */
export async function generateConnectionKey(): Promise<string> {
  const { data: key, error } = await supabase.rpc('create_my_key');
  if (error) throw new Error(error.message);
  return key;
}
