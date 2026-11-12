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
  branch text,
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
create index events_login_session_created_at on events (login, session_id, created_at);
create index events_login_created_at on events (login, created_at);

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
  insert into events (login, session_id, cwd, branch, event, agent_id, agent_type, workflow_run_id, workflow_name, tool, summary, task,
                      input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens)
  values (owner, p_event->>'session_id', p_event->>'cwd', p_event->>'branch', p_event->>'event', p_event->>'agent_id', p_event->>'agent_type',
          p_event->>'workflow_run_id', p_event->>'workflow_name', p_event->>'tool', p_event->>'summary', p_event->>'task',
          (p_event->>'input_tokens')::bigint, (p_event->>'output_tokens')::bigint,
          (p_event->>'cache_creation_tokens')::bigint, (p_event->>'cache_read_tokens')::bigint);
end $$;

-- Tokens dos últimos 7 dias locais, um valor por dia (nunca em percentual), sem contar a sessão duas vezes.
-- Conversa: o Stop traz o acumulado, então o gasto é a diferença para o Stop anterior da sessão (nunca negativo: se o
-- acumulado cai, a conversa recomeçou). O primeiro Stop guardado só conta inteiro se o início da sessão está guardado.
-- Agente: conta no dia em que terminou (SubagentStop).
create function week_tokens_of(p_login text, p_time_zone text, p_now timestamptz)
returns table (day date, input_tokens bigint, output_tokens bigint, cache_creation_tokens bigint, cache_read_tokens bigint)
language sql stable security definer set search_path = public as $$
  with session_start as (
    select f.session_id, (f.event = 'SessionStart' and coalesce(f.summary, '') <> 'resume') as start_is_stored
    from (
      select distinct on (e.session_id) e.session_id, e.event, e.summary
      from events e
      where e.login = p_login
        and (e.event in ('SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd', 'PermissionRequest')
             or (e.event = 'Notification' and split_part(e.summary, ':', 1) in ('permission_prompt', 'elicitation_dialog', 'agent_needs_input')))
      order by e.session_id, e.created_at, e.id
    ) f
  ),
  stops as (
    select e.session_id, e.created_at,
           e.input_tokens as input_now, e.output_tokens as output_now,
           e.cache_creation_tokens as creation_now, e.cache_read_tokens as read_now,
           lag(e.input_tokens) over w as input_before, lag(e.output_tokens) over w as output_before,
           lag(e.cache_creation_tokens) over w as creation_before, lag(e.cache_read_tokens) over w as read_before,
           row_number() over w as stop_number
    from events e
    where e.login = p_login and e.event = 'Stop' and e.input_tokens is not null
    window w as (partition by e.session_id order by e.created_at, e.id)
  ),
  conversation as (
    select s.created_at,
           case when s.stop_number > 1 then greatest(0, s.input_now - s.input_before) when st.start_is_stored then s.input_now else 0 end as input_tokens,
           case when s.stop_number > 1 then greatest(0, coalesce(s.output_now, 0) - coalesce(s.output_before, 0)) when st.start_is_stored then coalesce(s.output_now, 0) else 0 end as output_tokens,
           case when s.stop_number > 1 then greatest(0, coalesce(s.creation_now, 0) - coalesce(s.creation_before, 0)) when st.start_is_stored then coalesce(s.creation_now, 0) else 0 end as cache_creation_tokens,
           case when s.stop_number > 1 then greatest(0, coalesce(s.read_now, 0) - coalesce(s.read_before, 0)) when st.start_is_stored then coalesce(s.read_now, 0) else 0 end as cache_read_tokens
    from stops s
    join session_start st using (session_id)
  ),
  agents as (
    select e.created_at, e.input_tokens, coalesce(e.output_tokens, 0), coalesce(e.cache_creation_tokens, 0), coalesce(e.cache_read_tokens, 0)
    from events e
    where e.login = p_login and e.event = 'SubagentStop' and e.input_tokens is not null
  ),
  counted as (
    select * from conversation
    union all
    select * from agents
  ),
  by_day as (
    select (c.created_at at time zone p_time_zone)::date as day, c.input_tokens, c.output_tokens, c.cache_creation_tokens, c.cache_read_tokens
    from counted c
  )
  select d.day, sum(d.input_tokens)::bigint, sum(d.output_tokens)::bigint, sum(d.cache_creation_tokens)::bigint, sum(d.cache_read_tokens)::bigint
  from by_day d
  where d.day between (p_now at time zone p_time_zone)::date - 6 and (p_now at time zone p_time_zone)::date
  group by d.day
  having sum(d.input_tokens) + sum(d.output_tokens) + sum(d.cache_creation_tokens) + sum(d.cache_read_tokens) > 0
  order by d.day desc
$$;

create function my_week_tokens(p_time_zone text default 'UTC')
returns table (day date, input_tokens bigint, output_tokens bigint, cache_creation_tokens bigint, cache_read_tokens bigint)
language sql stable security definer set search_path = public as $$
  select w.day, w.input_tokens, w.output_tokens, w.cache_creation_tokens, w.cache_read_tokens
  from week_tokens_of(my_login(), p_time_zone, now()) w
  where is_member()
$$;

revoke execute on function ingest, create_my_key, is_member from public;
grant execute on function ingest to anon;
grant execute on function create_my_key, is_member to authenticated;

-- Sessões do próprio login que seguiam abertas antes do instante pedido (o último evento anterior não é SessionEnd).
-- O painel carrega o histórico delas para o estado "sua vez / sem sinal / aguardando" e o grupo "Abertas, sem atividade hoje".
create or replace function open_sessions_of(p_login text, p_before timestamptz)
returns table (session_id text)
language sql stable security definer set search_path = public as $$
  select last_event.session_id
  from (
    select distinct on (e.session_id) e.session_id, e.event
    from events e
    where e.login = p_login and e.created_at < p_before
    order by e.session_id, e.created_at desc, e.id desc
  ) last_event
  where last_event.event <> 'SessionEnd'
$$;

create or replace function my_open_sessions(p_before timestamptz)
returns table (session_id text)
language sql stable security definer set search_path = public as $$
  select o.session_id from open_sessions_of(my_login(), p_before) o where is_member()
$$;

revoke execute on function week_tokens_of, open_sessions_of from public, anon, authenticated;
revoke execute on function my_open_sessions from public, anon;
grant execute on function my_open_sessions to authenticated;
revoke execute on function my_week_tokens from public, anon;
grant execute on function my_week_tokens to authenticated;

alter publication supabase_realtime add table events;

-- Liberar acesso (login do GitHub):
-- insert into members (login) values ('joaocarlos-vesti');
