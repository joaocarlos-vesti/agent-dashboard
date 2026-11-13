-- Tokens por modelo, duração da ferramenta, id do prompt e hora real do evento. Rodar uma vez no SQL Editor do Supabase (pode rodar de novo).
-- Pré-requisito: a 003_v2_2.sql já rodou.
alter table events add column if not exists tokens_by_model jsonb;
alter table events add column if not exists duration_ms bigint;
alter table events add column if not exists prompt_id text;
alter table events add column if not exists occurred_at timestamptz;

create or replace function ingest(p_key uuid, p_event jsonb) returns void language plpgsql security definer set search_path = public as $$
declare owner text;
begin
  select login into owner from ingest_keys where key = p_key;
  if owner is null then raise exception 'invalid_key'; end if;
  insert into events (login, session_id, cwd, branch, event, agent_id, agent_type, workflow_run_id, workflow_name, tool, summary, task,
                      input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
                      tokens_by_model, duration_ms, prompt_id, occurred_at)
  values (owner, p_event->>'session_id', p_event->>'cwd', p_event->>'branch', p_event->>'event', p_event->>'agent_id', p_event->>'agent_type',
          p_event->>'workflow_run_id', p_event->>'workflow_name', p_event->>'tool', p_event->>'summary', p_event->>'task',
          (p_event->>'input_tokens')::bigint, (p_event->>'output_tokens')::bigint,
          (p_event->>'cache_creation_tokens')::bigint, (p_event->>'cache_read_tokens')::bigint,
          p_event->'tokens_by_model', (p_event->>'duration_ms')::bigint, p_event->>'prompt_id', (p_event->>'occurred_at')::timestamptz);
end $$;
