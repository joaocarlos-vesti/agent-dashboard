import type { WeekTokensRow } from './queries';
import type { AgentEvent } from './types';

type NoArgs = Record<PropertyKey, never>;

/** Tabelas e funções do Supabase que o painel usa, escritas à mão conforme `supabase/schema.sql` e as migrações. */
export interface Database {
  public: {
    Tables: {
      events: { Row: Pick<AgentEvent, keyof AgentEvent>; Insert: never; Update: never; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      is_member: { Args: NoArgs; Returns: boolean };
      create_my_key: { Args: NoArgs; Returns: string };
      my_open_sessions: { Args: { p_before: string }; Returns: { session_id: string }[] };
      my_week_tokens: { Args: { p_time_zone: string }; Returns: WeekTokensRow[] };
      my_connection_status: { Args: NoArgs; Returns: { has_key: boolean; key_created_at: string | null; last_event_at: string | null }[] };
    };
  };
}
