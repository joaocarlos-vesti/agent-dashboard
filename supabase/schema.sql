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

create policy members_read_events on events for select to authenticated using (is_member());

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
  insert into events (login, session_id, cwd, event, agent_id, agent_type, workflow_run_id, workflow_name, tool, summary, task)
  values (owner, p_event->>'session_id', p_event->>'cwd', p_event->>'event', p_event->>'agent_id', p_event->>'agent_type',
          p_event->>'workflow_run_id', p_event->>'workflow_name', p_event->>'tool', p_event->>'summary', p_event->>'task');
end $$;

revoke execute on function ingest, create_my_key, is_member from public;
grant execute on function ingest to anon;
grant execute on function create_my_key, is_member to authenticated;

alter publication supabase_realtime add table events;

-- Liberar acesso (login do GitHub):
-- insert into members (login) values ('joaocarlos-vesti');
