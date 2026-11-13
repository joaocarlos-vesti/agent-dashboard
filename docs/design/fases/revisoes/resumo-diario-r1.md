REVISÃO DE LÓGICA — Resumo diário (daily_usage) @ stage sobre 21fccf8 · rodada 1

Escopo: `git diff --cached` (migration 007, teste SQL 007, schema.sql, cleanup.sql, scripts/backfill-uso-diario.mjs mais o teste). O SQL não foi executado em lugar nenhum; li linha a linha. `npx vitest run scripts/backfill-uso-diario.test.mjs`: 12/12. Gerei `scripts/saida/backfill-uso-diario.sql` (ignorado pelo git): 161 linhas em 18 dias (22/10 a 12/11).

Pontos obrigatórios
1. O que o backfill apaga: só `daily_usage`, nunca `events`. O SQL gerado e o `buildBackfillSql` (script, linha 257) fazem `delete from daily_usage where login = … and source = 'events' and day in (…)`. Na migration, o `removed` de `summarize_daily_usage` também só apaga `daily_usage` com `source = 'events'`, só nos dias do intervalo. O único `delete from events` é o do `prune_events`. Aceitável.
2. Limpeza: atendido.
   - `prune_events` só apaga eventos de membro com marca d'água, e só quando são mais antigos que 7 dias e anteriores ao fim do dia da marca d'água, no fuso do dev.
   - A marca d'água vai no máximo até ontem e só avança quando o resumo do dev termina sem erro, porque o bloco `exception` desfaz o que foi feito. Logo, o dia corrente e os dias ainda não resumidos nunca são apagados.
   - O `daily_maintenance` roda resumo e limpeza nessa ordem. O cron está às `0 6 * * *` UTC.
3. Sem contar em dobro: é a mesma regra da `week_tokens_of`.
   - Na conversa, o gasto é a diferença entre os Stops (`lag` sobre todos os Stops antes de filtrar), nunca negativa. O primeiro Stop só conta se o início está guardado (mesma lista de eventos do navegador). Cada SubagentStop soma inteiro.
   - Divergências planejadas: a hora usada é `coalesce(occurred_at, created_at)`, conforme a decisão D3. A diferença por modelo soma só as altas de cada modelo; quando um modelo cai e outro sobe no mesmo Stop, o total passa o da semana.
   - Não há chave repetida: `all_keys` é UNION, e `token_sums`, `host_models` e `extras` são únicos por chave. Por isso o `on conflict` não toca a mesma linha duas vezes. O upsert e o `removed` mexem em linhas diferentes.
4. Segurança: atendido.
   - `daily_usage` tem RLS só de leitura do próprio login com `is_member()`, sem política de escrita.
   - As 7 funções novas não podem ser executadas por public, anon nem authenticated. As `security definer` têm `search_path` fixo, e o cron roda como o dono do banco.
   - O `occurred_at` vem do cliente, mas só afeta os dados do próprio login.
5. Sintaxe: provável de rodar.
   - `create extension if not exists pg_cron` funciona: o controle do pg_cron fixa o schema.
   - `cron.schedule` com nome substitui o job existente (pg_cron 1.3 ou mais novo), e o `unschedule` de `limpa-eventos` é condicional.
   - Revisei o resto: CTEs com escrita no nível de cima do `select … into`, `FILTER` com janela, `jsonb_each` lateral, os tipos das colunas nos `union all`, os nomes de variáveis plpgsql sem colidir com colunas, e o revoke por nome sem argumentos (os nomes são únicos).
   - Pré-requisito: a 006 rodada (`tokens_by_model`, `occurred_at`).
6. Privacidade do SQL gerado: atendido. Levantei todos os textos entre aspas do arquivo. Só aparecem o login, datas, ids de sessão em formato UUID, rótulos de agente ('principal', tipos do plugin, 'Explore', 'Plan', 'fork', 'general-purpose', 'workflow-subagent #n', 'desconhecido'), modelos e 'local'/'events'. Nenhum texto de conversa, caminho ou comando.

Achados (só MENOR)
1. [MENOR] Migration 007, final (`cron.schedule`). O cron já fica agendado, diferente do plano, que agendava só depois do backfill e da conferência da marca d'água. Hoje não há risco: não existe evento com mais de 7 dias, e o local vence depois. Se a ordem for invertida no futuro, o resumo por eventos roda primeiro, o que continua seguro.
2. [MENOR] Fronteira entre local e eventos. Uma resposta às 23:59 do último dia local cujo Stop chega às 00:01 conta duas vezes: no dia local (pelo horário da resposta) e no primeiro dia por eventos (pela diferença entre os Stops). Acontece uma única vez, na transição de 12/11 para 13/11.
3. [MENOR] Reprocessamento depois da limpeza. Uma sessão retomada depois de 5 a 7 dias parada: quando o dia é reprocessado (marca d'água − 1), o Stop anterior pode já ter sido apagado. O primeiro Stop vira só base, e o número do dia diminui por cima do certo. O mesmo acontece na semana.
4. [MENOR] `waiting_permission_ms` pelos eventos é sempre número, nunca nulo. Em dias anteriores à captura do `PermissionRequest`, 0 afirma "sem espera" quando o certo seria "não deu para medir" (é o que o próprio comentário da coluna diz).
5. [MENOR] Rótulo de workflow diferente por fonte: 'workflow: nome' nos eventos e 'workflow-subagent #n' no local. Somar por rótulo entre dias de fontes diferentes não casa.
6. [MENOR] supabase/tests/007_daily_usage.sql. O teste roda `summarize_closed_days`, `prune_events` e `daily_maintenance` com o "agora" em 20/11, sobre todos os membros reais (apaga eventos reais dentro da transação). A segurança depende inteiramente do `rollback`. Avisar o dono para rodar o arquivo inteiro de uma vez, nunca um trecho.
7. [MENOR] scripts/backfill-uso-diario.mjs:56. O `sessionId` vem do nome do arquivo sem validação de UUID. Hoje só aparecem UUIDs; validar evita que um nome estranho de arquivo vá para o banco.
8. [MENOR] Duração local: 11-07 tem 1.358 min (22,6 h) porque sessões em paralelo somam. Está coerente com a regra, mas a tela não deve ler esse número como tempo de relógio.

Perguntas de produto: no dia 12/11, o local vence os eventos (D8), mas só enxerga esta máquina. Sessões da nuvem ou de outro computador desse dia saem do resumo. Aceita?

VEREDITO: APROVADO
