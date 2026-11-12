-- Teste manual do my_week_tokens (R57). Rodar no SQL Editor DEPOIS da migration 003.
-- Tudo roda numa transação que termina em ROLLBACK: nenhum evento de teste fica no banco.
-- Se algo estiver errado, o bloco falha com a linha "esperado X, veio Y"; se passar, mostra "OK".
begin;

-- Hoje, no fuso de São Paulo: 12/11/2026 às 12:00 (15:00 UTC).
insert into events (login, session_id, event, summary, created_at, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens) values
  -- Sessão A começou ontem às 22:40 e continuou hoje: ontem 100 mil, hoje 60 mil, semana 160 mil.
  ('teste-semana', 'A', 'SessionStart', 'startup', '2026-11-12 01:40+00', null, null, null, null),
  ('teste-semana', 'A', 'Stop', null, '2026-11-12 02:00+00', 70000, 30000, 1000, 5000),
  ('teste-semana', 'A', 'Stop', null, '2026-11-12 13:00+00', 110000, 50000, 3000, 9000),
  -- Agente da sessão A que terminou hoje às 00:10 local (03:10 UTC): conta hoje, mesmo iniciado ontem.
  ('teste-semana', 'A', 'SubagentStop', null, '2026-11-12 03:10+00', 7000, 3000, 0, 0),
  -- Sessão B sem o início guardado (começa por um resume): o primeiro Stop é só a base.
  ('teste-semana', 'B', 'SessionStart', 'resume', '2026-11-10 13:00+00', null, null, null, null),
  ('teste-semana', 'B', 'Stop', null, '2026-11-10 14:00+00', 500000, 0, 0, 0),
  ('teste-semana', 'B', 'Stop', null, '2026-11-11 14:00+00', 520000, 0, 0, 0),
  -- Sessão C: o acumulado cai (conversa compactada): 160 mil -> 20 mil -> 35 mil = 175 mil, nunca negativo.
  ('teste-semana', 'C', 'SessionStart', 'startup', '2026-11-09 13:00+00', null, null, null, null),
  ('teste-semana', 'C', 'Stop', null, '2026-11-09 14:00+00', 160000, 0, 0, 0),
  ('teste-semana', 'C', 'Stop', null, '2026-11-09 15:00+00', 20000, 0, 0, 0),
  ('teste-semana', 'C', 'Stop', null, '2026-11-09 16:00+00', 35000, 0, 0, 0),
  -- Sessões abertas/encerradas antes de hoje (para o carregamento do dia): D terminou, E ficou aberta, F começou hoje.
  ('teste-semana', 'D', 'SessionStart', 'startup', '2026-11-11 13:00+00', null, null, null, null),
  ('teste-semana', 'D', 'SessionEnd', null, '2026-11-11 14:00+00', null, null, null, null),
  ('teste-semana', 'E', 'SessionStart', 'startup', '2026-11-11 13:00+00', null, null, null, null),
  ('teste-semana', 'E', 'Notification', 'permission_prompt: x', '2026-11-12 02:50+00', null, null, null, null),
  ('teste-semana', 'F', 'SessionStart', 'startup', '2026-11-12 12:00+00', null, null, null, null),
  -- Evento de outro login nunca entra.
  ('outra-pessoa', 'Z', 'Stop', null, '2026-11-12 13:00+00', 999999, 0, 0, 0);

do $$
declare
  actual jsonb;
begin
  -- São Paulo. Dia 12: A (160k - 100k) + agente 10k = 70k. Dia 11: A 100k + B (520k - 500k) = 120k. Dia 9: C = 175k.
  select coalesce(jsonb_object_agg(w.day::text, w.input_tokens + w.output_tokens), '{}') into actual
    from week_tokens_of('teste-semana', 'America/Sao_Paulo', '2026-11-12 15:00+00') w;
  if actual <> '{"2026-11-12": 70000, "2026-11-11": 120000, "2026-11-09": 175000}'::jsonb then
    raise exception 'São Paulo: veio %', actual;
  end if;

  -- UTC: o Stop de 02:00 UTC já é dia 12. Dia 12: A 100k + 60k + agente 10k = 170k. Dia 11: B 20k. Dia 9: C 175k.
  select coalesce(jsonb_object_agg(w.day::text, w.input_tokens + w.output_tokens), '{}') into actual
    from week_tokens_of('teste-semana', 'UTC', '2026-11-12 15:00+00') w;
  if actual <> '{"2026-11-12": 170000, "2026-11-11": 20000, "2026-11-09": 175000}'::jsonb then
    raise exception 'UTC: veio %', actual;
  end if;

  -- Fora dos 7 dias do seletor (hoje e os 6 anteriores) não entra: daqui a 5 dias o dia 9 sai e o 12 continua.
  select coalesce(jsonb_object_agg(w.day::text, w.input_tokens + w.output_tokens), '{}') into actual
    from week_tokens_of('teste-semana', 'America/Sao_Paulo', '2026-11-17 15:00+00') w;
  if actual ? '2026-11-09' or not actual ? '2026-11-12' then raise exception 'janela de 7 dias: veio %', actual; end if;

  -- Abertas antes de 12/11 00:00 em São Paulo (03:00 UTC): A (sem SessionEnd), B, C e E; D terminou e F começou depois.
  if (select array_agg(o.session_id order by o.session_id) from open_sessions_of('teste-semana', '2026-11-12 03:00+00') o) is distinct from array['A', 'B', 'C', 'E'] then
    raise exception 'sessões abertas: veio %', (select array_agg(o.session_id order by o.session_id) from open_sessions_of('teste-semana', '2026-11-12 03:00+00') o);
  end if;

  raise notice 'OK: my_week_tokens soma por dia local sem contar em dobro';
end $$;

rollback;
