-- Substituído pela migration 007_resumo_diario.sql: o agendamento 'resumo-diario-e-limpeza' (03:00 de São Paulo) resume os dias fechados
-- e só depois apaga eventos com mais de 7 dias de dias já resumidos. O agendamento antigo 'limpa-eventos' é removido por ela.
-- Plano gratuito tem 500 MB: guarda só a última semana de eventos.
select cron.schedule('resumo-diario-e-limpeza', '0 6 * * *', 'select public.daily_maintenance()');
