# F2 — Dados

Branch `feat/mapa-vivo-v2-2`, base `ffe60a0`. Sem push, sem deploy. A migration **não foi rodada** no Supabase.

## O que entrou
| Arquivo | O quê |
|---|---|
| `hook/send.sh` | `SessionStart` grava a origem (`source`: startup/resume/clear/compact) no `summary`, que o board já lê; envia `branch` (`git -C "$cwd" branch --show-current`; fora de git, pasta inexistente ou HEAD solto → `null`). `SubagentStop`: se o REPROVADO (que não seja "nenhum/sem/não REPROVADO") só aparece depois do caractere 160, o trecho enviado começa nele em vez de cortar o começo |
| `src/lib/queries.ts` (novo) | Funções puras: `dayFilter` (dia local → `gte`/`lt` UTC), `fetchAllPages` (páginas de 1.000, para na incompleta, erro vira `Error(mensagem do Supabase)`), `loadDayEvents` (eventos do dia + resto das sessões do dia, em lotes de 50 ids), `weekTokensFromRows` (linhas do RPC → lista por dia) |
| `src/eventSource.ts` (novo) | Chamada real ao Supabase (`eventsInRange`, `eventsOfSessionsOutside`, `fetchWeekTokenRows`). Sem regra, sem teste |
| `src/useDashboard.ts` | Troca a janela de 24 h / limite 5.000 por `loadDayEvents` (aceita o dia visto; padrão hoje); erro devolve a mensagem (`historyError`); descarta resposta de carga antiga. Fecha o **N3** da F1 |
| `src/App.tsx`, `src/BoardView.tsx` | Mínimo para o novo hook: mensagem do erro e vazio "Nenhuma sessão do Claude Code neste dia." (tela nova é F3) |
| `src/lib/board.ts`, `types.ts` | `session.branch` = branch do `SessionStart` mais recente que a trouxe; `AgentEvent.branch` |
| `supabase/migrations/003_v2_2.sql`, `supabase/schema.sql` | Coluna `branch`; índices `(login, session_id, created_at)` e `(login, created_at)`; `ingest` grava a branch; `week_tokens_of` (interna) + `my_week_tokens(p_time_zone)` por dia local |
| `supabase/tests/003_week_tokens.sql` (novo) | Teste manual do R57, termina em `rollback` |

## Matriz × teste
| Linha | Teste |
|---|---|
| R52 | `SessionStart envia a branch`, `…fora de repositório git…`, `…HEAD solto…`, `…pasta que não existe…`, `só o SessionStart leva a branch`, `SessionStart grava a origem no resumo`, `…sem origem fica sem resumo` (`hook/send.test.ts`) |
| R53 | `sessão mostra a branch do início`, `…branch nula`, `retomada em outra branch…`, `retomada sem branch nova…`, `origem startup… conta como início` (board) |
| R54 | `consulta do dia usa os limites locais` (queries) |
| R55 | `consulta do dia inclui o histórico das sessões do dia`, `…dia passado traz também o que a sessão fez depois`, `sessão com vários eventos… uma vez só`, `dia sem eventos não busca sessões`, `lotes de 50`, `erro na busca das sessões…` |
| R56 | `consulta pagina até trazer tudo` (3 chamadas, 2.500 eventos), `página cheia pede mais uma`, `sem eventos faz uma chamada só`, `erro na segunda página falha… com a mensagem do Supabase`, `resposta sem dados…` |
| R57 | `supabase/tests/003_week_tokens.sql` (manual, ver abaixo) + `semana do banco vira lista por dia…`, `semana ignora dia fora do seletor…` (queries) |
| Extra | 5 testes do hook para o REPROVADO além dos 160 caracteres (reprovado no fim, APROVADO longo, "nenhum REPROVADO", resultado curto, REPROVADO dentro dos 160) |

## Fase vermelha
Escrevi todos os testes e stubs antes. Resultado: `hook/send.test.ts` 6 falhas de 17; `queries.test.ts` 13 de 14; `board.test.ts` 4 de 90. Todas por `AssertionError` (valor errado/ausente), nenhuma por import ou digitação. Passaram vacuamente: os negativos (`só o SessionStart leva a branch`, `dia sem eventos não busca sessões`, `APROVADO longo`, `"nenhum REPROVADO"`, `resultado curto`, `startup conta como início`), que protegem a regressão. Um erro de fixture meu (cast no `eventsInRange` do fake) apareceu na implementação e foi corrigido no teste.

## Verificações
- `npx tsc --noEmit`: sem saída (ok).
- `npm test`: `Test Files 8 passed (8) · Tests 171 passed (171)` (140 → 171).
- SQL: **não executado**. Tentei subir um Postgres local para validar a migration e o teste; o ambiente negou o comando, então a migration e o `003_week_tokens.sql` foram só revistos à mão (contas conferidas na mão: SP dia 12 = 70 mil, dia 11 = 120 mil, dia 9 = 175 mil; UTC dia 12 = 170 mil). O dono precisa rodar o teste.

## O que o dono precisa rodar
1. No SQL Editor: `supabase/migrations/003_v2_2.sql` (a 002 precisa ter rodado antes; pode repetir).
2. Depois `supabase/tests/003_week_tokens.sql` (termina em `rollback`; deve mostrar a nota `OK: my_week_tokens soma por dia local sem contar em dobro`).
3. Publicar o hook novo (`npm run deploy` publica `send.sh`); cada dev reinstala/atualiza o hook para a branch e a origem passarem a ser enviadas.

## Decisões que a spec não fechava
1. **REPROVADO além dos 160:** sem coluna nova; o hook começa o trecho no REPROVADO (só vale para `SubagentStop`). O limite do trecho no board continua 160. A checagem de "nenhum/sem/não" no hook ignora maiúsculas (mais conservadora que o board): na dúvida, não reprova, para o trecho cortado nunca perder o "nenhum" e virar reprovação falsa.
2. **Índice extra** `(login, created_at)` além do pedido, porque a consulta do dia filtra por login e tempo.
3. **`my_week_tokens(p_time_zone text default 'UTC')`** devolve uma linha por dia (`day`, 4 colunas de tokens), só dias com tokens, nos 7 dias locais. A conta espelha o `sessionTokens` do navegador (diferença entre `Stop`s, queda não gera negativo, primeiro `Stop` inteiro só com início guardado, agente no dia do `SubagentStop`). Função interna `week_tokens_of(login, fuso, agora)` existe só para o teste fixar o "agora"; sem permissão para ninguém além do dono do banco. A assinatura antiga `my_week_tokens()` é removida (nada no código a usava).
4. **Consulta da sessão** traz tudo que a sessão fez fora do dia (antes e depois), não só o passado, porque o R23 "continua hoje →" precisa do depois.
5. **Branch no board:** a do `SessionStart` mais recente que informou uma (retomada em outra branch vale; retomada sem branch mantém a anterior).

## Ficou de fora
- `fetchWeekTokenRows` e o seletor de dia ligados à tela: F3 (o hook já aceita `viewedDay`).
- Reconexão ao virar o dia e atualização só do card: F4.
- Identificador da sessão na nuvem ("Abrir a sessão"): segue a confirmar.
- Origem `compact`/`clear` como primeiro evento guardado conta como início (só `resume` não conta, como o R22/R26 definem).
