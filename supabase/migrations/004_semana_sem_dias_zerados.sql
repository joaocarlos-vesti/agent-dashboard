-- Correção da 003: dia em que a soma dos tokens é zero não entra no resultado (ex.: o primeiro Stop de uma sessão retomada só vira base).
-- Rodar uma vez no SQL Editor do Supabase (pode rodar de novo sem estragar nada). Mesma assinatura da 003, então basta substituir a função.

create or replace function week_tokens_of(p_login text, p_time_zone text, p_now timestamptz)
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

-- Permissões já definidas na 003 continuam valendo (create or replace não as altera).
