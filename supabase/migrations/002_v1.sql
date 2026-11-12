-- Migração da v1. Rodar uma vez no SQL Editor do Supabase (pode rodar de novo sem estragar nada).

-- 1. Cada dev vê só os próprios eventos.
drop policy if exists members_read_events on events;
drop policy if exists own_events_read on events;
create policy own_events_read on events for select to authenticated using (login = my_login() and is_member());

-- 2. Tokens por evento: SubagentStop traz os do agente; Stop traz o acumulado da conversa principal.
alter table events
  add column if not exists input_tokens bigint,
  add column if not exists output_tokens bigint,
  add column if not exists cache_creation_tokens bigint,
  add column if not exists cache_read_tokens bigint;

create or replace function ingest(p_key uuid, p_event jsonb) returns void language plpgsql security definer set search_path = public as $$
declare owner text;
begin
  select login into owner from ingest_keys where key = p_key;
  if owner is null then raise exception 'invalid_key'; end if;
  insert into events (login, session_id, cwd, event, agent_id, agent_type, workflow_run_id, workflow_name, tool, summary, task,
                      input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens)
  values (owner, p_event->>'session_id', p_event->>'cwd', p_event->>'event', p_event->>'agent_id', p_event->>'agent_type',
          p_event->>'workflow_run_id', p_event->>'workflow_name', p_event->>'tool', p_event->>'summary', p_event->>'task',
          (p_event->>'input_tokens')::bigint, (p_event->>'output_tokens')::bigint,
          (p_event->>'cache_creation_tokens')::bigint, (p_event->>'cache_read_tokens')::bigint);
end $$;

-- 3. Tokens dos últimos 7 dias do próprio login: o último Stop de cada sessão (acumulado) + todos os SubagentStop.
create or replace function my_week_tokens()
returns table (input_tokens bigint, output_tokens bigint, cache_creation_tokens bigint, cache_read_tokens bigint)
language sql stable security definer set search_path = public as $$
  with mine as (
    select * from events
    where login = my_login() and is_member() and created_at > now() - interval '7 days' and input_tokens is not null
  ),
  last_stop_per_session as (
    select distinct on (session_id) * from mine where event = 'Stop' order by session_id, created_at desc, id desc
  ),
  counted as (
    select * from last_stop_per_session
    union all
    select * from mine where event = 'SubagentStop'
  )
  select coalesce(sum(c.input_tokens), 0)::bigint, coalesce(sum(c.output_tokens), 0)::bigint,
         coalesce(sum(c.cache_creation_tokens), 0)::bigint, coalesce(sum(c.cache_read_tokens), 0)::bigint
  from counted c
$$;

revoke execute on function my_week_tokens from public, anon;
grant execute on function my_week_tokens to authenticated;
