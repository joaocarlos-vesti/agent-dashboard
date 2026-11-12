-- Rodar uma vez no SQL Editor do Supabase.
create table members (login text primary key);
create table ingest_keys (
  key uuid primary key default gen_random_uuid(),
  login text not null unique references members on delete cascade,
  created_at timestamptz not null default now()
);
create table events (
  id bigint generated always as identity primary key,
  login text not null,
  session_id text not null,
  cwd text,
  event text not null,
  agent_id text,
  agent_type text,
  workflow_run_id text,
  workflow_name text,
  tool text,
  summary text,
  task text,
  input_tokens bigint,
  output_tokens bigint,
  cache_creation_tokens bigint,
  cache_read_tokens bigint,
  created_at timestamptz not null default now()
);
create index events_created_at on events (created_at desc);

alter table members enable row level security;
alter table ingest_keys enable row level security;
alter table events enable row level security;

create function my_login() returns text language sql stable as $$
  select auth.jwt() -> 'user_metadata' ->> 'user_name'
$$;

create function is_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where login = my_login())
$$;

create policy own_events_read on events for select to authenticated using (login = my_login() and is_member());

create function create_my_key() returns uuid language plpgsql security definer set search_path = public as $$
declare new_key uuid;
begin
  if not is_member() then raise exception 'not_member'; end if;
  delete from ingest_keys where login = my_login();
  insert into ingest_keys (login) values (my_login()) returning key into new_key;
  return new_key;
end $$;

-- Única porta de escrita: quem não tem chave válida não grava nada.
create function ingest(p_key uuid, p_event jsonb) returns void language plpgsql security definer set search_path = public as $$
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

-- Tokens dos últimos 7 dias do próprio login: o último Stop de cada sessão (acumulado) + todos os SubagentStop.
create function my_week_tokens()
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

revoke execute on function ingest, create_my_key, is_member from public;
grant execute on function ingest to anon;
grant execute on function create_my_key, is_member to authenticated;
revoke execute on function my_week_tokens from public, anon;
grant execute on function my_week_tokens to authenticated;

alter publication supabase_realtime add table events;

-- Liberar acesso (login do GitHub):
-- insert into members (login) values ('joaocarlos-vesti');
