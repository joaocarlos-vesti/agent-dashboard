-- Rodar uma vez no SQL Editor do Supabase.
create table members (
  login text primary key,
  time_zone text not null default 'America/Sao_Paulo',
  -- Até esta data (dia local do dev) tudo já foi resumido; a limpeza nunca apaga evento depois dela.
  summarized_through date
);
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
  tokens_by_model jsonb,
  duration_ms bigint,
  prompt_id text,
  occurred_at timestamptz,
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

-- Estado da conexão do próprio login, sem gerar chave.
create function my_connection_status()
returns table (has_key boolean, key_created_at timestamptz, last_event_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not_member'; end if;
  return query select
    exists (select 1 from ingest_keys where login = my_login()),
    (select created_at from ingest_keys where login = my_login()),
    (select max(created_at) from events where login = my_login());
end $$;

-- Única porta de escrita: quem não tem chave válida não grava nada.
create function ingest(p_key uuid, p_event jsonb) returns void language plpgsql security definer set search_path = public as $$
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
revoke execute on function my_connection_status from public, anon;
grant execute on function my_connection_status to authenticated;

alter publication supabase_realtime add table events;

-- Resumo diário de uso (migration 007_resumo_diario.sql).
create extension if not exists pg_cron;


create table if not exists daily_usage (
  login text not null references members on delete cascade,
  day date not null,
  session_id text not null,
  agent_label text not null,
  model text not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_creation_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  calls integer not null default 0,
  duration_ms bigint not null default 0,
  -- duration_ms = working_ms + waiting_permission_ms. waiting_permission_ms nulo = não deu para separar (working_ms então inclui a espera).
  working_ms bigint not null default 0,
  waiting_permission_ms bigint,
  source text not null default 'events',
  updated_at timestamptz not null default now(),
  primary key (login, day, session_id, agent_label, model)
);
alter table daily_usage enable row level security;
-- Sem política de escrita: só funções security definer gravam.
drop policy if exists own_daily_usage_read on daily_usage;
create policy own_daily_usage_read on daily_usage for select to authenticated using (login = my_login() and is_member());

-- O Claude só informa tokens_by_model quando há resposta com modelo; {} e nulo contam como "sem mapa".
create or replace function has_model_map(model_map jsonb) returns boolean language sql immutable as $$
  select coalesce(jsonb_typeof(model_map) = 'object' and model_map <> '{}'::jsonb, false)
$$;

create or replace function model_tokens(usage jsonb, field text) returns bigint language sql immutable as $$
  select coalesce((usage ->> field)::bigint, 0)
$$;

-- Esperas por permissão de uma pessoa: do aviso até o próximo evento da mesma origem. O dono do aviso segue src/lib/board.ts:
-- aviso com agent_id é do agente; sem agent_id é da única origem com ferramenta em andamento (fora Agent/Task), senão da conversa principal.
-- Aviso repetido (Notification sem agente logo depois do PermissionRequest) não conta de novo. Aviso sem fim guardado não entra.
create or replace function permission_waits_of(p_login text)
returns table (session_id text, owner_agent_id text, started_at timestamptz, ended_at timestamptz, ended_by text)
language plpgsql stable security definer set search_path = public as $$
declare
  ev record;
  current_session text;
  tool_in_flight jsonb := '{}';
  pending_waits jsonb := '{}';
  last_notice_is_request boolean := false;
  notice_owner text;
  candidate_origins text[];
  pending_owner text;
begin
  for ev in
    select e.session_id, e.event, e.agent_id, e.tool, coalesce(e.occurred_at, e.created_at) as t
    from events e
    where e.login = p_login
      and (e.event in ('SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd', 'PermissionRequest')
           or (e.event = 'Notification' and split_part(e.summary, ':', 1) in ('permission_prompt', 'elicitation_dialog', 'agent_needs_input')))
    order by e.session_id, coalesce(e.occurred_at, e.created_at), e.id
  loop
    if ev.session_id is distinct from current_session then
      current_session := ev.session_id;
      tool_in_flight := '{}';
      pending_waits := '{}';
      last_notice_is_request := false;
    end if;

    if ev.event in ('PermissionRequest', 'Notification') then
      if not (last_notice_is_request and pending_waits <> '{}' and ev.event = 'Notification' and ev.agent_id is null) then
        if ev.agent_id is not null then
          notice_owner := ev.agent_id;
        else
          select array_agg(origin.key) into candidate_origins
          from jsonb_each_text(tool_in_flight) origin where origin.value not in ('Agent', 'Task');
          notice_owner := case when coalesce(cardinality(candidate_origins), 0) = 1 then candidate_origins[1] else '' end;
        end if;
        if not pending_waits ? notice_owner then
          pending_waits := pending_waits || jsonb_build_object(notice_owner, ev.t);
        end if;
        last_notice_is_request := ev.event = 'PermissionRequest';
      end if;
    else
      for pending_owner in select k from jsonb_object_keys(pending_waits) k loop
        if ev.event in ('UserPromptSubmit', 'Stop', 'SessionEnd') or coalesce(ev.agent_id, '') = pending_owner then
          session_id := current_session;
          owner_agent_id := nullif(pending_owner, '');
          started_at := (pending_waits ->> pending_owner)::timestamptz;
          ended_at := ev.t;
          ended_by := ev.event;
          return next;
          pending_waits := pending_waits - pending_owner;
        end if;
      end loop;
      if ev.event = 'PreToolUse' then
        tool_in_flight := tool_in_flight || jsonb_build_object(coalesce(ev.agent_id, ''), coalesce(ev.tool, ''));
      elsif ev.event = 'PostToolUse' then
        tool_in_flight := tool_in_flight - coalesce(ev.agent_id, '');
      end if;
    end if;
  end loop;
end $$;

-- Resume os dias fechados de p_from a p_to de um dev (devolve as linhas gravadas). Mesmas regras de "sem contar em dobro" da week_tokens_of:
-- a conversa manda o acumulado a cada Stop (gasto = diferença para o Stop anterior da sessão e do modelo, nunca negativo);
-- o primeiro Stop guardado só conta inteiro se o início da sessão está guardado; cada SubagentStop soma inteiro no dia em que terminou.
-- O dia e a ordem usam occurred_at (hora real) e, sem ela, created_at. Dia com linhas source = 'local' é pulado.
-- calls = um por Stop e por SubagentStop. duration_ms = soma, por pedido, de Stop - UserPromptSubmit na conversa e SubagentStop - SubagentStart no agente.
-- calls, duração e espera ficam na linha do modelo com mais tokens de saída do dia/sessão/agente.
create or replace function summarize_daily_usage(p_login text, p_from date, p_to date, p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare
  member_time_zone text;
  rows_written integer;
begin
  select m.time_zone into member_time_zone from members m where m.login = p_login;
  if member_time_zone is null then raise exception 'unknown_member'; end if;
  perform now() at time zone member_time_zone;

  with ev as (
    select e.id, e.session_id, e.event, e.agent_id, e.agent_type, e.workflow_run_id, e.workflow_name, e.summary,
           e.input_tokens, e.output_tokens, e.cache_creation_tokens, e.cache_read_tokens, e.tokens_by_model,
           coalesce(e.occurred_at, e.created_at) as t
    from events e
    where e.login = p_login
  ),
  days as (
    select p_from + g as day
    from generate_series(0, p_to - p_from) g
    where ((p_from + g + 1)::timestamp at time zone member_time_zone) <= p_now
      and not exists (select 1 from daily_usage u where u.login = p_login and u.day = p_from + g and u.source = 'local')
  ),
  session_start as (
    select f.session_id, (f.event = 'SessionStart' and coalesce(f.summary, '') <> 'resume') as start_is_stored
    from (
      select distinct on (v.session_id) v.session_id, v.event, v.summary
      from ev v
      where v.event in ('SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop', 'Stop', 'SessionEnd', 'PermissionRequest')
         or (v.event = 'Notification' and split_part(v.summary, ':', 1) in ('permission_prompt', 'elicitation_dialog', 'agent_needs_input'))
      order by v.session_id, v.t, v.id
    ) f
  ),
  stops as (
    select v.session_id, v.t,
           v.input_tokens as input_now, v.output_tokens as output_now, v.cache_creation_tokens as creation_now, v.cache_read_tokens as read_now,
           lag(v.input_tokens) over w as input_before, lag(v.output_tokens) over w as output_before,
           lag(v.cache_creation_tokens) over w as creation_before, lag(v.cache_read_tokens) over w as read_before,
           v.tokens_by_model as map_now, lag(v.tokens_by_model) over w as map_before,
           row_number() over w as stop_number
    from ev v
    where v.event = 'Stop' and v.input_tokens is not null
    window w as (partition by v.session_id order by v.t, v.id)
  ),
  counted_stops as (
    select s.*
    from stops s
    join session_start st using (session_id)
    where s.stop_number > 1 or st.start_is_stored
  ),
  -- Sem mapa por modelo (ou na transição de sem mapa para com mapa): a diferença total vai para 'desconhecido'.
  conversation_without_model as (
    select c.session_id, c.t, 'principal'::text as agent_label, 'desconhecido'::text as model,
           case when c.stop_number > 1 then greatest(0, c.input_now - c.input_before) else c.input_now end as input_tokens,
           case when c.stop_number > 1 then greatest(0, coalesce(c.output_now, 0) - coalesce(c.output_before, 0)) else coalesce(c.output_now, 0) end as output_tokens,
           case when c.stop_number > 1 then greatest(0, coalesce(c.creation_now, 0) - coalesce(c.creation_before, 0)) else coalesce(c.creation_now, 0) end as cache_creation_tokens,
           case when c.stop_number > 1 then greatest(0, coalesce(c.read_now, 0) - coalesce(c.read_before, 0)) else coalesce(c.read_now, 0) end as cache_read_tokens
    from counted_stops c
    where not (has_model_map(c.map_now) and (c.stop_number = 1 or has_model_map(c.map_before)))
  ),
  -- Modelo que não estava no Stop anterior conta inteiro; acumulado que cai vira 0.
  conversation_by_model as (
    select c.session_id, c.t, 'principal'::text as agent_label, m.key as model,
           greatest(0, model_tokens(m.value, 'input_tokens') - model_tokens(c.map_before -> m.key, 'input_tokens')) as input_tokens,
           greatest(0, model_tokens(m.value, 'output_tokens') - model_tokens(c.map_before -> m.key, 'output_tokens')) as output_tokens,
           greatest(0, model_tokens(m.value, 'cache_creation_tokens') - model_tokens(c.map_before -> m.key, 'cache_creation_tokens')) as cache_creation_tokens,
           greatest(0, model_tokens(m.value, 'cache_read_tokens') - model_tokens(c.map_before -> m.key, 'cache_read_tokens')) as cache_read_tokens
    from counted_stops c
    cross join lateral jsonb_each(c.map_now) m
    where has_model_map(c.map_now) and (c.stop_number = 1 or has_model_map(c.map_before))
  ),
  -- Rótulo do agente: tipo; workflow vira 'workflow: nome' (o nome vem de outro evento da mesma execução). Nunca o texto da tarefa.
  agent_stops as (
    select v.*,
           case when v.agent_type = 'workflow-subagent'
                then 'workflow: ' || coalesce(v.workflow_name,
                       (select max(w.workflow_name) from ev w where w.session_id = v.session_id and w.workflow_run_id = v.workflow_run_id and w.workflow_name is not null),
                       'sem nome')
                else coalesce(v.agent_type, 'desconhecido') end as agent_label
    from ev v
    where v.event = 'SubagentStop'
  ),
  agents_without_model as (
    select a.session_id, a.t, a.agent_label, 'desconhecido'::text as model,
           a.input_tokens, coalesce(a.output_tokens, 0) as output_tokens, coalesce(a.cache_creation_tokens, 0) as cache_creation_tokens, coalesce(a.cache_read_tokens, 0) as cache_read_tokens
    from agent_stops a
    where a.input_tokens is not null and not has_model_map(a.tokens_by_model)
  ),
  agents_by_model as (
    select a.session_id, a.t, a.agent_label, m.key as model,
           model_tokens(m.value, 'input_tokens') as input_tokens, model_tokens(m.value, 'output_tokens') as output_tokens,
           model_tokens(m.value, 'cache_creation_tokens') as cache_creation_tokens, model_tokens(m.value, 'cache_read_tokens') as cache_read_tokens
    from agent_stops a
    cross join lateral jsonb_each(a.tokens_by_model) m
    where a.input_tokens is not null and has_model_map(a.tokens_by_model)
  ),
  token_rows as (
    select * from conversation_without_model
    union all select * from conversation_by_model
    union all select * from agents_without_model
    union all select * from agents_by_model
  ),
  token_sums as (
    select (r.t at time zone member_time_zone)::date as day, r.session_id, r.agent_label, r.model,
           sum(r.input_tokens)::bigint as input_tokens, sum(r.output_tokens)::bigint as output_tokens,
           sum(r.cache_creation_tokens)::bigint as cache_creation_tokens, sum(r.cache_read_tokens)::bigint as cache_read_tokens
    from token_rows r
    group by 1, 2, 3, 4
  ),
  -- Pedido da conversa: do último UserPromptSubmit até o Stop; Stop sem pedido novo desde o Stop anterior não soma tempo.
  prompt_events as (
    select v.session_id, v.t, v.event,
           max(v.t) filter (where v.event = 'UserPromptSubmit') over (partition by v.session_id order by v.t, v.id rows between unbounded preceding and current row) as last_prompt_at,
           max(v.t) filter (where v.event = 'Stop') over (partition by v.session_id order by v.t, v.id rows between unbounded preceding and 1 preceding) as previous_stop_at
    from ev v
    where v.event in ('UserPromptSubmit', 'Stop')
  ),
  main_turns as (
    select p.session_id, p.t, 'principal'::text as agent_label, 1 as calls,
           case when p.last_prompt_at is not null and (p.previous_stop_at is null or p.previous_stop_at <= p.last_prompt_at)
                then greatest(0, round(extract(epoch from p.t - p.last_prompt_at) * 1000))::bigint else 0 end as duration_ms,
           0::bigint as wait_ms
    from prompt_events p
    where p.event = 'Stop'
  ),
  agent_turns as (
    select a.session_id, a.t, a.agent_label, 1 as calls,
           coalesce(greatest(0, round(extract(epoch from a.t - (
             select min(s.t) from ev s where s.event = 'SubagentStart' and s.session_id = a.session_id and s.agent_id = a.agent_id)) * 1000))::bigint, 0) as duration_ms,
           0::bigint as wait_ms
    from agent_stops a
  ),
  -- Espera da conversa entra no dia em que acabou; a do agente, no dia e rótulo do SubagentStop dele. Aviso que acabou com novo pedido do dev não entra.
  permission_waits as (
    select w.session_id,
           case when w.owner_agent_id is null then w.ended_at else a.t end as t,
           case when w.owner_agent_id is null then 'principal' else a.agent_label end as agent_label,
           0 as calls, 0::bigint as duration_ms,
           round(extract(epoch from w.ended_at - w.started_at) * 1000)::bigint as wait_ms
    from permission_waits_of(p_login) w
    left join agent_stops a on a.session_id = w.session_id and a.agent_id = w.owner_agent_id
    where w.ended_by not in ('UserPromptSubmit', 'SessionEnd')
      and (w.owner_agent_id is null or a.agent_id is not null)
  ),
  extras as (
    select (x.t at time zone member_time_zone)::date as day, x.session_id, x.agent_label,
           sum(x.calls)::integer as calls, sum(x.duration_ms)::bigint as duration_ms, sum(x.wait_ms)::bigint as wait_ms
    from (select * from main_turns union all select * from agent_turns union all select * from permission_waits) x
    group by 1, 2, 3
  ),
  host_models as (
    select distinct on (k.day, k.session_id, k.agent_label) k.day, k.session_id, k.agent_label, coalesce(s.model, 'desconhecido') as model
    from extras k
    left join token_sums s on s.day = k.day and s.session_id = k.session_id and s.agent_label = k.agent_label
    order by k.day, k.session_id, k.agent_label, s.output_tokens desc nulls last, s.model
  ),
  all_keys as (
    select s.day, s.session_id, s.agent_label, s.model from token_sums s
    union
    select h.day, h.session_id, h.agent_label, h.model from host_models h
  ),
  final_rows as (
    select k.day, k.session_id, k.agent_label, k.model,
           coalesce(s.input_tokens, 0) as input_tokens, coalesce(s.output_tokens, 0) as output_tokens,
           coalesce(s.cache_creation_tokens, 0) as cache_creation_tokens, coalesce(s.cache_read_tokens, 0) as cache_read_tokens,
           coalesce(x.calls, 0) as calls, coalesce(x.duration_ms, 0) as duration_ms,
           coalesce(x.duration_ms, 0) - least(coalesce(x.wait_ms, 0), coalesce(x.duration_ms, 0)) as working_ms,
           least(coalesce(x.wait_ms, 0), coalesce(x.duration_ms, 0)) as waiting_permission_ms
    from all_keys k
    join days d on d.day = k.day
    left join token_sums s on s.day = k.day and s.session_id = k.session_id and s.agent_label = k.agent_label and s.model = k.model
    left join host_models h on h.day = k.day and h.session_id = k.session_id and h.agent_label = k.agent_label and h.model = k.model
    left join extras x on h.model is not null and x.day = k.day and x.session_id = k.session_id and x.agent_label = k.agent_label
    where coalesce(s.input_tokens, 0) + coalesce(s.output_tokens, 0) + coalesce(s.cache_creation_tokens, 0) + coalesce(s.cache_read_tokens, 0) > 0
       or coalesce(x.calls, 0) > 0 or coalesce(x.duration_ms, 0) > 0
  ),
  upserted as (
    insert into daily_usage (login, day, session_id, agent_label, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
                             calls, duration_ms, working_ms, waiting_permission_ms, source, updated_at)
    select p_login, f.day, f.session_id, f.agent_label, f.model, f.input_tokens, f.output_tokens, f.cache_creation_tokens, f.cache_read_tokens,
           f.calls, f.duration_ms, f.working_ms, f.waiting_permission_ms, 'events', now()
    from final_rows f
    on conflict (login, day, session_id, agent_label, model) do update set
      input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
      cache_creation_tokens = excluded.cache_creation_tokens, cache_read_tokens = excluded.cache_read_tokens,
      calls = excluded.calls, duration_ms = excluded.duration_ms, working_ms = excluded.working_ms,
      waiting_permission_ms = excluded.waiting_permission_ms, source = excluded.source, updated_at = now()
    returning 1
  ),
  removed as (
    delete from daily_usage u
    where u.login = p_login and u.source = 'events' and u.day in (select d.day from days d)
      and not exists (select 1 from final_rows f where f.day = u.day and f.session_id = u.session_id and f.agent_label = u.agent_label and f.model = u.model)
    returning 1
  )
  select count(*) into rows_written from upserted;

  return rows_written;
end $$;

-- Resume os dias fechados que faltam de cada dev. Erro de um dev (fuso inválido, por exemplo) não impede os outros nem avança a marca d'água dele.
-- Reprocessa os 2 últimos dias já resumidos (evento atrasado), mas só os que ainda estão dentro dos 7 dias em que a limpeza guarda tudo.
create or replace function summarize_closed_days(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare
  member_row record;
  local_today date;
  first_event_day date;
  from_day date;
  to_day date;
  rows_total integer := 0;
begin
  for member_row in select m.login, m.time_zone, m.summarized_through from members m order by m.login loop
    begin
      local_today := (p_now at time zone member_row.time_zone)::date;
      to_day := local_today - 1;
      select min((coalesce(e.occurred_at, e.created_at) at time zone member_row.time_zone)::date) into first_event_day
        from events e where e.login = member_row.login;
      -- Sem marca d'água nada foi apagado ainda; com ela, os dias depois dela também estão intactos mesmo após dias de cron parado.
      from_day := case when member_row.summarized_through is null then coalesce(first_event_day, to_day)
                       else least(member_row.summarized_through + 1, greatest(member_row.summarized_through - 1, local_today - 6)) end;
      if from_day <= to_day then
        rows_total := rows_total + summarize_daily_usage(member_row.login, from_day, to_day, p_now);
      end if;
      update members set summarized_through = greatest(coalesce(summarized_through, to_day), to_day) where login = member_row.login;
    exception when others then
      raise warning 'resumo diário falhou para %: %', member_row.login, sqlerrm;
    end;
  end loop;
  return rows_total;
end $$;

-- Apaga eventos com mais de 7 dias, mas só os de dias já resumidos (antes do fim do dia da marca d'água). Quem nunca foi resumido não perde nada.
-- Evento de login que não é membro segue a regra antiga (mais de 7 dias).
create or replace function prune_events(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public as $$
declare
  member_row record;
  deleted_count integer;
  deleted_total integer := 0;
begin
  for member_row in select m.login, m.time_zone, m.summarized_through from members m where m.summarized_through is not null loop
    begin
      delete from events e
      where e.login = member_row.login
        and e.created_at < p_now - interval '7 days'
        and e.created_at < ((member_row.summarized_through + 1)::timestamp at time zone member_row.time_zone);
      get diagnostics deleted_count = row_count;
      deleted_total := deleted_total + deleted_count;
    exception when others then
      raise warning 'limpeza falhou para %: %', member_row.login, sqlerrm;
    end;
  end loop;
  delete from events e
  where e.created_at < p_now - interval '7 days' and not exists (select 1 from members m where m.login = e.login);
  get diagnostics deleted_count = row_count;
  return deleted_total + deleted_count;
end $$;

-- Primeiro resume, depois apaga: a limpeza nunca roda antes do resumo.
create or replace function daily_maintenance(p_now timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
begin
  perform summarize_closed_days(p_now);
  perform prune_events(p_now);
end $$;

revoke execute on function has_model_map, model_tokens, permission_waits_of, summarize_daily_usage, summarize_closed_days, prune_events, daily_maintenance
  from public, anon, authenticated;

-- 06:00 UTC = 03:00 de São Paulo (sem horário de verão). Substitui o agendamento antigo de limpeza.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'limpa-eventos') then
    perform cron.unschedule('limpa-eventos');
  end if;
end $$;
select cron.schedule('resumo-diario-e-limpeza', '0 6 * * *', 'select public.daily_maintenance()');

-- Liberar acesso (login do GitHub):
-- insert into members (login) values ('joaocarlos-vesti');
