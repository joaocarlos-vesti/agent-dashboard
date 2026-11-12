-- Estado da conexão do próprio login, sem gerar chave. Rodar uma vez no SQL Editor do Supabase (pode rodar de novo).
-- Pré-requisito: a 002_v1.sql já rodou.
create or replace function my_connection_status()
returns table (has_key boolean, key_created_at timestamptz, last_event_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not_member'; end if;
  return query select
    exists (select 1 from ingest_keys where login = my_login()),
    (select created_at from ingest_keys where login = my_login()),
    (select max(created_at) from events where login = my_login());
end $$;

revoke execute on function my_connection_status from public, anon;
grant execute on function my_connection_status to authenticated;
