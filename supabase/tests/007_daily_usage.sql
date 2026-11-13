-- Teste manual do resumo diário (daily_usage). Rodar no SQL Editor DEPOIS da migration 007.
-- Tudo roda numa transação que termina em ROLLBACK: nenhum membro, evento ou linha de teste fica no banco.
-- Se algo estiver errado, o bloco falha com "<caso>: esperado X, veio Y"; se passar, mostra "OK".
-- Fuso de São Paulo = UTC-3 (sem horário de verão). Os horários abaixo estão em UTC (Z = +00).
begin;

create function pg_temp.expect(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception '%: esperado %, veio %', label, expected, actual;
  end if;
end $$;

create function pg_temp.tok(input_tokens bigint, output_tokens bigint) returns jsonb language sql as $$
  select jsonb_build_object('input_tokens', input_tokens, 'output_tokens', output_tokens, 'cache_creation_tokens', 0, 'cache_read_tokens', 0)
$$;

-- p_at é o created_at (chegada no banco); p_occurred é a hora real enviada pelo hook (pode ser nula).
create function pg_temp.add_event(
  p_login text, p_session text, p_event text, p_at timestamptz,
  p_agent_id text default null, p_agent_type text default null, p_tool text default null, p_summary text default null,
  p_input bigint default null, p_output bigint default null, p_by_model jsonb default null, p_occurred timestamptz default null,
  p_workflow_run_id text default null, p_workflow_name text default null, p_task text default null
) returns void language sql as $$
  insert into events (login, session_id, event, created_at, agent_id, agent_type, tool, summary, input_tokens, output_tokens, tokens_by_model,
                      occurred_at, workflow_run_id, workflow_name, task)
  values (p_login, p_session, p_event, p_at, p_agent_id, p_agent_type, p_tool, p_summary, p_input, p_output, p_by_model,
          p_occurred, p_workflow_run_id, p_workflow_name, p_task)
$$;

insert into members (login) values
  ('t-semana'), ('t-atraso'), ('t-modelo'), ('t-rotulos'), ('t-tempo'), ('t-fechado'), ('t-tzbom'), ('t-tzruim'),
  ('t-limpa'), ('t-semmarca'), ('t-manut'), ('t-local'), ('t-outro');
update members set time_zone = 'Nao/Existe' where login = 't-tzruim';

-- Cenário do teste 003 (sem tokens_by_model), p_now = 13/11 12:00 em São Paulo.
insert into events (login, session_id, event, summary, created_at, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens) values
  ('t-semana', 'A', 'SessionStart', 'startup', '2026-11-12 01:40+00', null, null, null, null),
  ('t-semana', 'A', 'Stop', null, '2026-11-12 02:00+00', 70000, 30000, 1000, 5000),
  ('t-semana', 'A', 'Stop', null, '2026-11-12 13:00+00', 110000, 50000, 3000, 9000),
  ('t-semana', 'A', 'SubagentStop', null, '2026-11-12 03:10+00', 7000, 3000, 0, 0),
  ('t-semana', 'B', 'SessionStart', 'resume', '2026-11-10 13:00+00', null, null, null, null),
  ('t-semana', 'B', 'Stop', null, '2026-11-10 14:00+00', 500000, 0, 0, 0),
  ('t-semana', 'B', 'Stop', null, '2026-11-11 14:00+00', 520000, 0, 0, 0),
  ('t-semana', 'C', 'SessionStart', 'startup', '2026-11-09 13:00+00', null, null, null, null),
  ('t-semana', 'C', 'Stop', null, '2026-11-09 14:00+00', 160000, 0, 0, 0),
  ('t-semana', 'C', 'Stop', null, '2026-11-09 15:00+00', 20000, 0, 0, 0),
  ('t-semana', 'C', 'Stop', null, '2026-11-09 16:00+00', 35000, 0, 0, 0),
  ('t-outro', 'Z', 'Stop', null, '2026-11-12 13:00+00', 999999, 0, 0, 0);

do $$
declare
  row_count integer;
  checksum_before text;
  checksum_after text;
  week_actual text;
  week_expected text;
  tz text;
begin
  -- 1. Equivalência com a semana: o total por dia (todos os modelos) é igual ao da week_tokens_of, em São Paulo e em UTC.
  -- Trocar o fuso e resumir de novo também prova que as linhas do fuso antigo não sobram.
  foreach tz in array array['America/Sao_Paulo', 'UTC'] loop
    update members set time_zone = tz where login = 't-semana';
    perform summarize_daily_usage('t-semana', '2026-11-01', '2026-11-13', '2026-11-13 15:00+00');
    select coalesce(jsonb_object_agg(d.day::text, d.total), '{}')::text into week_actual
      from (select u.day, sum(u.input_tokens + u.output_tokens + u.cache_creation_tokens + u.cache_read_tokens) as total
            from daily_usage u where u.login = 't-semana' group by u.day
            having sum(u.input_tokens + u.output_tokens + u.cache_creation_tokens + u.cache_read_tokens) > 0) d;
    select coalesce(jsonb_object_agg(w.day::text, w.input_tokens + w.output_tokens + w.cache_creation_tokens + w.cache_read_tokens), '{}')::text into week_expected
      from week_tokens_of('t-semana', tz, '2026-11-13 15:00+00') w;
    perform pg_temp.expect('equivalência com a semana em ' || tz, week_actual, week_expected);
  end loop;
  perform pg_temp.expect('dia da semana em UTC tem tokens', (select (count(*) > 0)::text from daily_usage where login = 't-semana' and day = '2026-11-12'), 'true');

  -- 2. Idempotência: rodar de novo dá as mesmas linhas, a mesma contagem e os mesmos números.
  select count(*), md5(string_agg(concat_ws('|', day, session_id, agent_label, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
                                              calls, duration_ms, working_ms, waiting_permission_ms), ',' order by day, session_id, agent_label, model))
    into row_count, checksum_before from daily_usage where login = 't-semana';
  perform pg_temp.expect('idempotência: linhas gravadas', summarize_daily_usage('t-semana', '2026-11-01', '2026-11-13', '2026-11-13 15:00+00')::text, row_count::text);
  select md5(string_agg(concat_ws('|', day, session_id, agent_label, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
                                    calls, duration_ms, working_ms, waiting_permission_ms), ',' order by day, session_id, agent_label, model))
    into checksum_after from daily_usage where login = 't-semana';
  perform pg_temp.expect('idempotência: conteúdo', checksum_after, checksum_before);
  perform pg_temp.expect('evento de outro login não entra', (select count(*)::text from daily_usage where login = 't-semana' and session_id = 'Z'), '0');
end $$;

-- 3 e 9. Evento atrasado: o Stop A chegou ao banco no dia 12, mas aconteceu no dia 10 (occurred_at vence created_at na escolha do dia e na ordem).
-- Pela ordem de chegada o Stop B (acumulado 250) viria primeiro e o A viraria 0; pela hora real: dia 10 = 100, dia 11 = 150.
select pg_temp.add_event('t-atraso', 'S', 'SessionStart', '2026-11-10 13:00+00', p_summary => 'startup');
select pg_temp.add_event('t-atraso', 'S', 'Stop', '2026-11-12 13:00+00', p_input => 100, p_occurred => '2026-11-10 14:00+00');
select pg_temp.add_event('t-atraso', 'S', 'Stop', '2026-11-11 14:00+00', p_input => 250, p_occurred => '2026-11-11 14:00+00');
-- Linha antiga do mesmo dia que não existe mais nos eventos (some) e linha fora do intervalo pedido (fica).
insert into daily_usage (login, day, session_id, agent_label, model, input_tokens, source) values
  ('t-atraso', '2026-11-11', 'fantasma', 'principal', 'desconhecido', 777, 'events'),
  ('t-atraso', '2026-10-01', 'fora-do-intervalo', 'principal', 'desconhecido', 5, 'events');

do $$
begin
  perform summarize_daily_usage('t-atraso', '2026-11-09', '2026-11-13', '2026-11-14 15:00+00');
  perform pg_temp.expect('atraso: dia 10 e 11', (select string_agg(day || '=' || input_tokens, ',' order by day) from daily_usage where login = 't-atraso' and session_id = 'S'), '2026-11-10=100,2026-11-11=150');
  perform pg_temp.expect('atraso: dia 12 (chegada) vazio', (select count(*)::text from daily_usage where login = 't-atraso' and day = '2026-11-12'), '0');
  perform pg_temp.expect('atraso: linha antiga some', (select count(*)::text from daily_usage where login = 't-atraso' and session_id = 'fantasma'), '0');
  perform pg_temp.expect('atraso: fora do intervalo fica', (select count(*)::text from daily_usage where login = 't-atraso' and session_id = 'fora-do-intervalo'), '1');
  -- Chega outro evento atrasado no dia 11: o dia é reprocessado e muda.
  perform pg_temp.add_event('t-atraso', 'S', 'Stop', '2026-11-14 10:00+00', p_input => 300, p_occurred => '2026-11-11 15:00+00');
  perform summarize_daily_usage('t-atraso', '2026-11-09', '2026-11-13', '2026-11-14 15:00+00');
  perform pg_temp.expect('atraso: dia reprocessado', (select string_agg(day || '=' || input_tokens, ',' order by day) from daily_usage where login = 't-atraso' and session_id = 'S'), '2026-11-10=100,2026-11-11=200');
end $$;

-- 4 a 7. Por modelo, queda do acumulado, retomada e transição de "sem mapa" para "com mapa". Dia 10, sessões separadas.
-- M: dois modelos e um terceiro que aparece no meio.
select pg_temp.add_event('t-modelo', 'M', 'SessionStart', '2026-11-10 12:00+00', p_summary => 'startup');
select pg_temp.add_event('t-modelo', 'M', 'Stop', '2026-11-10 13:00+00', p_input => 150, p_output => 15, p_by_model => jsonb_build_object('opus', pg_temp.tok(100, 10), 'sonnet', pg_temp.tok(50, 5)));
select pg_temp.add_event('t-modelo', 'M', 'Stop', '2026-11-10 14:00+00', p_input => 230, p_output => 35, p_by_model => jsonb_build_object('opus', pg_temp.tok(180, 30), 'sonnet', pg_temp.tok(50, 5)));
select pg_temp.add_event('t-modelo', 'M', 'Stop', '2026-11-10 15:00+00', p_input => 330, p_output => 45, p_by_model => jsonb_build_object('opus', pg_temp.tok(180, 30), 'sonnet', pg_temp.tok(50, 5), 'haiku', pg_temp.tok(100, 10)));
-- N: o acumulado do opus cai (conversa compactada): 160 -> 20 -> 50 = 160 + 0 + 30 = 190.
select pg_temp.add_event('t-modelo', 'N', 'SessionStart', '2026-11-10 12:00+00', p_summary => 'startup');
select pg_temp.add_event('t-modelo', 'N', 'Stop', '2026-11-10 13:00+00', p_input => 160, p_by_model => jsonb_build_object('opus', pg_temp.tok(160, 0)));
select pg_temp.add_event('t-modelo', 'N', 'Stop', '2026-11-10 14:00+00', p_input => 20, p_by_model => jsonb_build_object('opus', pg_temp.tok(20, 0)));
select pg_temp.add_event('t-modelo', 'N', 'Stop', '2026-11-10 15:00+00', p_input => 50, p_by_model => jsonb_build_object('opus', pg_temp.tok(50, 0)));
-- R: sessão retomada, o primeiro Stop guardado só vira base: conta 520 - 500 = 20.
select pg_temp.add_event('t-modelo', 'R', 'SessionStart', '2026-11-10 12:00+00', p_summary => 'resume');
select pg_temp.add_event('t-modelo', 'R', 'Stop', '2026-11-10 13:00+00', p_input => 500, p_by_model => jsonb_build_object('opus', pg_temp.tok(500, 0)));
select pg_temp.add_event('t-modelo', 'R', 'Stop', '2026-11-10 14:00+00', p_input => 520, p_by_model => jsonb_build_object('opus', pg_temp.tok(520, 0)));
-- T: o Stop 1 não tem mapa; no Stop 2 o mapa aparece: a diferença total (50) vai para 'desconhecido'; o Stop 3 já separa (opus 50).
select pg_temp.add_event('t-modelo', 'T', 'SessionStart', '2026-11-10 12:00+00', p_summary => 'startup');
select pg_temp.add_event('t-modelo', 'T', 'Stop', '2026-11-10 13:00+00', p_input => 100);
select pg_temp.add_event('t-modelo', 'T', 'Stop', '2026-11-10 14:00+00', p_input => 150, p_by_model => jsonb_build_object('opus', pg_temp.tok(150, 0)));
select pg_temp.add_event('t-modelo', 'T', 'Stop', '2026-11-10 15:00+00', p_input => 200, p_by_model => jsonb_build_object('opus', pg_temp.tok(200, 0)));

do $$
declare
  by_model text := $q$select string_agg(model || '=' || input_tokens || '/' || output_tokens, ',' order by model) from daily_usage where login = 't-modelo' and session_id = %L$q$;
  result text;
begin
  perform summarize_daily_usage('t-modelo', '2026-11-10', '2026-11-10', '2026-11-14 15:00+00');
  execute format(by_model, 'M') into result;
  perform pg_temp.expect('por modelo', result, 'haiku=100/10,opus=180/30,sonnet=50/5');
  execute format(by_model, 'N') into result;
  perform pg_temp.expect('queda do acumulado por modelo', result, 'opus=190/0');
  execute format(by_model, 'R') into result;
  perform pg_temp.expect('retomada: primeiro Stop é base', result, 'opus=20/0');
  execute format(by_model, 'T') into result;
  perform pg_temp.expect('transição sem mapa -> com mapa', result, 'desconhecido=150/0,opus=50/0');
  perform pg_temp.expect('nenhuma linha negativa', (select count(*)::text from daily_usage where login = 't-modelo' and (input_tokens < 0 or output_tokens < 0)), '0');
end $$;

-- 10. Rótulos: dois agentes do mesmo tipo viram uma linha; workflow vira 'workflow: nome' (o nome vem de outro evento da execução); a conversa é 'principal'.
-- O texto da tarefa nunca vira rótulo.
select pg_temp.add_event('t-rotulos', 'L', 'SessionStart', '2026-11-10 12:00+00', p_summary => 'startup');
select pg_temp.add_event('t-rotulos', 'L', 'SubagentStop', '2026-11-10 13:00+00', p_agent_id => 'a1', p_agent_type => 'revisor', p_input => 10, p_task => 'texto secreto da tarefa');
select pg_temp.add_event('t-rotulos', 'L', 'SubagentStop', '2026-11-10 13:05+00', p_agent_id => 'a2', p_agent_type => 'revisor', p_input => 20, p_task => 'outro texto secreto');
select pg_temp.add_event('t-rotulos', 'L', 'PostToolUse', '2026-11-10 13:06+00', p_tool => 'Workflow', p_workflow_run_id => 'wf_9', p_workflow_name => 'fluxo-x');
select pg_temp.add_event('t-rotulos', 'L', 'SubagentStop', '2026-11-10 13:10+00', p_agent_id => 'a3', p_agent_type => 'workflow-subagent', p_workflow_run_id => 'wf_9', p_input => 30, p_task => 'terceiro texto secreto');
select pg_temp.add_event('t-rotulos', 'L', 'Stop', '2026-11-10 14:00+00', p_input => 5);

do $$
begin
  perform summarize_daily_usage('t-rotulos', '2026-11-10', '2026-11-10', '2026-11-14 15:00+00');
  perform pg_temp.expect('rótulos', (select string_agg(agent_label || ':' || input_tokens || ':' || calls, ',' order by agent_label) from daily_usage where login = 't-rotulos'),
    'principal:5:1,revisor:30:2,workflow: fluxo-x:30:1');
end $$;

-- 11. calls, duração e espera por permissão. Dia 10, sessão P (conversa + um agente) e sessão Q (dono do aviso pela ferramenta em andamento).
-- Pedido 1 (13:00:00 a 13:02:00 = 120 s): a conversa espera 20 s (PermissionRequest 13:00:30 até o PostToolUse 13:00:50; o Notification repetido das 13:00:31 não conta de novo).
-- O agente a1 (13:01:00 a 13:01:40 = 40 s) espera 20 s.
-- Pedido 2: aviso das 13:10:05 acaba com novo pedido do dev (13:10:20) e não entra; o Stop das 13:10:30 soma 10 s desde o último pedido.
select pg_temp.add_event('t-tempo', 'P', 'SessionStart', '2026-11-10 12:00+00', p_summary => 'startup');
select pg_temp.add_event('t-tempo', 'P', 'UserPromptSubmit', '2026-11-10 13:00:00+00');
select pg_temp.add_event('t-tempo', 'P', 'PreToolUse', '2026-11-10 13:00:10+00', p_tool => 'Bash');
select pg_temp.add_event('t-tempo', 'P', 'PermissionRequest', '2026-11-10 13:00:30+00', p_tool => 'Bash', p_summary => 'permission_prompt: Bash ls');
select pg_temp.add_event('t-tempo', 'P', 'Notification', '2026-11-10 13:00:31+00', p_summary => 'permission_prompt: Claude precisa da sua permissão');
select pg_temp.add_event('t-tempo', 'P', 'PostToolUse', '2026-11-10 13:00:50+00', p_tool => 'Bash');
select pg_temp.add_event('t-tempo', 'P', 'SubagentStart', '2026-11-10 13:01:00+00', p_agent_id => 'a1', p_agent_type => 'revisor');
select pg_temp.add_event('t-tempo', 'P', 'PreToolUse', '2026-11-10 13:01:05+00', p_agent_id => 'a1', p_agent_type => 'revisor', p_tool => 'Edit');
select pg_temp.add_event('t-tempo', 'P', 'PermissionRequest', '2026-11-10 13:01:10+00', p_agent_id => 'a1', p_agent_type => 'revisor', p_tool => 'Edit', p_summary => 'permission_prompt: Edit x');
select pg_temp.add_event('t-tempo', 'P', 'PostToolUse', '2026-11-10 13:01:30+00', p_agent_id => 'a1', p_agent_type => 'revisor', p_tool => 'Edit');
select pg_temp.add_event('t-tempo', 'P', 'SubagentStop', '2026-11-10 13:01:40+00', p_agent_id => 'a1', p_agent_type => 'revisor', p_input => 10);
select pg_temp.add_event('t-tempo', 'P', 'Stop', '2026-11-10 13:02:00+00', p_input => 100);
select pg_temp.add_event('t-tempo', 'P', 'UserPromptSubmit', '2026-11-10 13:10:00+00');
select pg_temp.add_event('t-tempo', 'P', 'PermissionRequest', '2026-11-10 13:10:05+00', p_tool => 'Bash', p_summary => 'permission_prompt: Bash rm');
select pg_temp.add_event('t-tempo', 'P', 'UserPromptSubmit', '2026-11-10 13:10:20+00');
select pg_temp.add_event('t-tempo', 'P', 'Stop', '2026-11-10 13:10:30+00', p_input => 100);
-- Sessão Q: o aviso (Notification sem agent_id e sem PermissionRequest) é do agente a2, a única origem com ferramenta em andamento
-- (a conversa está em Agent, que não pede permissão). Espera de 30 s (14:00:20 a 14:00:50) dentro de 54 s do agente.
select pg_temp.add_event('t-tempo', 'Q', 'SessionStart', '2026-11-10 13:59+00', p_summary => 'startup');
select pg_temp.add_event('t-tempo', 'Q', 'PreToolUse', '2026-11-10 14:00:05+00', p_tool => 'Agent');
select pg_temp.add_event('t-tempo', 'Q', 'SubagentStart', '2026-11-10 14:00:06+00', p_agent_id => 'a2', p_agent_type => 'revisor');
select pg_temp.add_event('t-tempo', 'Q', 'PreToolUse', '2026-11-10 14:00:10+00', p_agent_id => 'a2', p_agent_type => 'revisor', p_tool => 'Bash');
select pg_temp.add_event('t-tempo', 'Q', 'Notification', '2026-11-10 14:00:20+00', p_summary => 'permission_prompt: Claude precisa da sua permissão');
select pg_temp.add_event('t-tempo', 'Q', 'PostToolUse', '2026-11-10 14:00:50+00', p_agent_id => 'a2', p_agent_type => 'revisor', p_tool => 'Bash');
select pg_temp.add_event('t-tempo', 'Q', 'SubagentStop', '2026-11-10 14:01:00+00', p_agent_id => 'a2', p_agent_type => 'revisor', p_input => 5);

do $$
declare
  summary_query text := $q$select string_agg(agent_label || ': calls=' || calls || ' duração=' || duration_ms || ' trabalho=' || working_ms || ' espera=' || coalesce(waiting_permission_ms::text, 'nulo'), '; ' order by agent_label)
                           from daily_usage where login = 't-tempo' and session_id = %L$q$;
  result text;
begin
  perform summarize_daily_usage('t-tempo', '2026-11-10', '2026-11-10', '2026-11-14 15:00+00');
  execute format(summary_query, 'P') into result;
  perform pg_temp.expect('calls, duração e espera da sessão P', result,
    'principal: calls=2 duração=130000 trabalho=110000 espera=20000; revisor: calls=1 duração=40000 trabalho=20000 espera=20000');
  execute format(summary_query, 'Q') into result;
  perform pg_temp.expect('dono do aviso pela ferramenta em andamento', result, 'revisor: calls=1 duração=54000 trabalho=24000 espera=30000');
end $$;

-- 13. Só dia fechado: às 23:59 de São Paulo o dia 12 ainda está aberto; às 00:01 do dia 13 já fecha.
select pg_temp.add_event('t-fechado', 'F', 'SessionStart', '2026-11-12 13:00+00', p_summary => 'startup');
select pg_temp.add_event('t-fechado', 'F', 'Stop', '2026-11-12 14:00+00', p_input => 100);

do $$
begin
  perform pg_temp.expect('dia aberto às 23:59', summarize_daily_usage('t-fechado', '2026-11-12', '2026-11-12', '2026-11-13 02:59+00')::text, '0');
  perform pg_temp.expect('dia fechado às 00:01', summarize_daily_usage('t-fechado', '2026-11-12', '2026-11-12', '2026-11-13 03:01+00')::text, '1');
end $$;

-- 14. Erro isolado: o fuso inválido de um dev não impede o resumo dos outros e não avança a marca d'água dele.
select pg_temp.add_event('t-tzbom', 'G', 'SessionStart', '2026-11-12 13:00+00', p_summary => 'startup');
select pg_temp.add_event('t-tzbom', 'G', 'Stop', '2026-11-12 14:00+00', p_input => 100);
select pg_temp.add_event('t-tzruim', 'H', 'SessionStart', '2026-11-12 13:00+00', p_summary => 'startup');
select pg_temp.add_event('t-tzruim', 'H', 'Stop', '2026-11-12 14:00+00', p_input => 100);

do $$
begin
  perform summarize_closed_days('2026-11-14 15:00+00');
  perform pg_temp.expect('marca d''água do fuso bom', (select summarized_through::text from members where login = 't-tzbom'), '2026-11-13');
  perform pg_temp.expect('linhas do fuso bom', (select sum(input_tokens)::text from daily_usage where login = 't-tzbom' and day = '2026-11-12'), '100');
  perform pg_temp.expect('marca d''água do fuso ruim não avança', (select coalesce(summarized_through::text, 'nula') from members where login = 't-tzruim'), 'nula');
  perform pg_temp.expect('fuso ruim não grava linhas', (select count(*)::text from daily_usage where login = 't-tzruim'), '0');
  -- Rodar de novo no mesmo dia mantém a marca d'água e o resultado.
  perform summarize_closed_days('2026-11-14 15:00+00');
  perform pg_temp.expect('marca d''água estável', (select summarized_through::text from members where login = 't-tzbom'), '2026-11-13');
  perform pg_temp.expect('resumo estável', (select sum(input_tokens)::text from daily_usage where login = 't-tzbom'), '100');
end $$;

-- O resumo geral da seção 14 deu marca d'água a todos os membros de teste; as seções seguintes partem de membros sem marca.
update members set summarized_through = null where login like 't-%' and login not in ('t-tzbom', 't-tzruim');

-- 15. Limpeza (p_now = 20/11 12:00 em São Paulo, marca d'água de t-limpa = dia 10, que termina em 11/11 03:00 UTC).
update members set summarized_through = '2026-11-10' where login = 't-limpa';
select pg_temp.add_event('t-limpa', 'coberto-1', 'Stop', '2026-11-05 13:00+00');
select pg_temp.add_event('t-limpa', 'coberto-2', 'Stop', '2026-11-10 12:00+00');
select pg_temp.add_event('t-limpa', 'coberto-3', 'Stop', '2026-11-11 02:00+00');
select pg_temp.add_event('t-limpa', 'depois-da-marca', 'Stop', '2026-11-11 04:00+00');
select pg_temp.add_event('t-limpa', 'recente', 'Stop', '2026-11-18 13:00+00');
select pg_temp.add_event('t-semmarca', 'sem-marca', 'Stop', '2026-11-01 13:00+00');
select pg_temp.add_event('login-fora-dos-membros', 'orfao-antigo', 'Stop', '2026-11-05 13:00+00');
select pg_temp.add_event('login-fora-dos-membros', 'orfao-recente', 'Stop', '2026-11-19 13:00+00');

do $$
begin
  perform prune_events('2026-11-20 15:00+00');
  perform pg_temp.expect('limpeza: o que sobra de t-limpa', (select string_agg(session_id, ',' order by session_id) from events where login = 't-limpa'), 'depois-da-marca,recente');
  perform pg_temp.expect('limpeza: sem marca d''água não apaga', (select count(*)::text from events where login = 't-semmarca'), '1');
  perform pg_temp.expect('limpeza: login fora dos membros segue a regra de 7 dias', (select string_agg(session_id, ',' order by session_id) from events where login = 'login-fora-dos-membros'), 'orfao-recente');
end $$;

-- 15b. daily_maintenance resume primeiro e só depois apaga: o dia antigo vira linha e os eventos dele saem.
select pg_temp.add_event('t-manut', 'X', 'SessionStart', '2026-11-01 13:00+00', p_summary => 'startup');
select pg_temp.add_event('t-manut', 'X', 'Stop', '2026-11-01 14:00+00', p_input => 100);
select pg_temp.add_event('t-tzruim', 'H2', 'Stop', '2026-11-01 14:00+00', p_input => 100);

do $$
begin
  perform daily_maintenance('2026-11-20 15:00+00');
  perform pg_temp.expect('manutenção: dia antigo resumido', (select sum(input_tokens)::text from daily_usage where login = 't-manut' and day = '2026-11-01'), '100');
  perform pg_temp.expect('manutenção: marca d''água', (select summarized_through::text from members where login = 't-manut'), '2026-11-19');
  perform pg_temp.expect('manutenção: eventos resumidos saem', (select count(*)::text from events where login = 't-manut'), '0');
  perform pg_temp.expect('manutenção: dev com erro não perde evento', (select count(*)::text from events where login = 't-tzruim' and session_id = 'H2'), '1');
end $$;

-- 16. Fonte local: dia com linha 'local' é pulado pelo resumo por eventos, e a linha local nunca é apagada.
insert into daily_usage (login, day, session_id, agent_label, model, input_tokens, source) values
  ('t-local', '2026-11-11', 'S-local', 'principal', 'opus', 999, 'local');
select pg_temp.add_event('t-local', 'E', 'SessionStart', '2026-11-11 12:00+00', p_summary => 'startup');
select pg_temp.add_event('t-local', 'E', 'Stop', '2026-11-11 14:00+00', p_input => 100);
select pg_temp.add_event('t-local', 'E', 'Stop', '2026-11-12 14:00+00', p_input => 140);

do $$
begin
  perform summarize_daily_usage('t-local', '2026-11-11', '2026-11-13', '2026-11-14 15:00+00');
  perform summarize_daily_usage('t-local', '2026-11-11', '2026-11-13', '2026-11-14 15:00+00');
  perform pg_temp.expect('local: dia 11 só com a linha local', (select string_agg(source || ':' || session_id || ':' || input_tokens, ',') from daily_usage where login = 't-local' and day = '2026-11-11'), 'local:S-local:999');
  perform pg_temp.expect('local: dia 12 vem dos eventos', (select sum(input_tokens)::text from daily_usage where login = 't-local' and day = '2026-11-12' and source = 'events'), '40');
end $$;

-- 12. RLS: o dev lê só as próprias linhas; outro login e anônimo leem zero; ninguém escreve; as funções de resumo não são chamáveis pelo painel.
do $$
declare
  own_rows integer;
  foreign_rows integer;
  other_dev_rows integer;
  non_member_rows integer;
  total_before integer;
  total_after integer;
  role_name text;
  attempt text;
begin
  select count(*) into total_before from daily_usage;
  perform set_config('request.jwt.claims', '{"role":"authenticated","user_metadata":{"user_name":"t-semana"}}', true);

  execute 'set local role authenticated';
  select count(*), count(*) filter (where login <> 't-semana') into own_rows, foreign_rows from daily_usage;
  select count(*) into other_dev_rows from daily_usage where login = 't-modelo';
  execute 'reset role';
  perform pg_temp.expect('RLS: dev lê as próprias linhas', (own_rows > 0)::text, 'true');
  perform pg_temp.expect('RLS: dev não lê linhas de outro login', (foreign_rows + other_dev_rows)::text, '0');

  perform set_config('request.jwt.claims', '{"role":"authenticated","user_metadata":{"user_name":"login-que-nao-e-membro"}}', true);
  execute 'set local role authenticated';
  select count(*) into non_member_rows from daily_usage;
  execute 'reset role';
  perform pg_temp.expect('RLS: quem não é membro lê zero', non_member_rows::text, '0');

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('set local role %I', role_name);
    foreach attempt in array array[
      $q$insert into daily_usage (login, day, session_id, agent_label, model) values ('t-semana', '2026-01-01', 'x', 'x', 'x')$q$,
      $q$update daily_usage set input_tokens = 1$q$,
      $q$delete from daily_usage$q$] loop
      begin
        execute attempt;
      exception when others then
        null; -- bloqueado por falta de permissão ou de política: é o esperado
      end;
    end loop;
    execute 'reset role';
  end loop;
  select count(*) into total_after from daily_usage;
  perform pg_temp.expect('RLS: anônimo e dev não escrevem', total_after::text, total_before::text);
  perform pg_temp.expect('RLS: nenhuma linha foi alterada', (select count(*)::text from daily_usage where input_tokens = 1), '0');

  perform pg_temp.expect('funções de resumo fechadas para o painel',
    (has_function_privilege('anon', 'summarize_daily_usage(text,date,date,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'summarize_daily_usage(text,date,date,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'daily_maintenance(timestamptz)', 'execute')
     or has_function_privilege('anon', 'prune_events(timestamptz)', 'execute'))::text, 'false');

  raise notice 'OK: resumo diário por evento e por modelo, sem contar em dobro, com espera por permissão, dia fechado, limpeza segura e RLS';
end $$;

rollback;
