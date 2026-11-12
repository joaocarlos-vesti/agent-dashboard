-- Rodar depois do schema.sql. Antes, ative "pg_cron" em Database → Extensions.
-- Plano gratuito tem 500 MB: guarda só a última semana.
select cron.schedule('limpa-eventos', '0 3 * * *', $$delete from events where created_at < now() - interval '7 days'$$);
