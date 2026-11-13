# F2 — Bateria r1 (commit b9f540a, base ffe60a0)

Branch `feat/mapa-vivo-v2-2`, HEAD `b9f540a`. Data 2026-11-12. Só leitura: nada foi corrigido.

## Comandos
- `npm test` (`vitest run`): **8 arquivos, 171 testes, 171 passam, 0 falham**. Exit 0.
- `npx tsc --noEmit`: **sem erros**. Exit 0.

Nenhum comando falhou.

## Matriz F2 × testes (linhas com Fase = F2 em `docs/spec.md`)

| Linha | Regra | Teste(s) encontrados | Status | Obs. |
|---|---|---|---|---|
| R52 | Branch no evento de início (`SessionStart` envia `branch`; fora de git / HEAD solto → `null`) | hook/send: `SessionStart envia a branch`, `…fora de repositório git envia branch nula, sem erro`, `…com HEAD solto envia branch nula`, `…de pasta que não existe envia branch nula`, `só o SessionStart leva a branch` | passou | |
| R53 | Branch da sessão no board (`session.branch` = branch do início) | board: `sessão mostra a branch do início`, `sessão sem branch no início fica com branch nula`, `sessão retomada em outra branch mostra a branch mais recente`, `retomada sem branch nova mantém a branch do início` | passou | |
| R54 | Consulta por dia monta o intervalo certo (SP, ontem → `gte 2026-11-11T03:00Z`, `lt 2026-11-12T03:00Z`) | queries: `consulta do dia usa os limites locais` | passou | |
| R55 | Consulta do dia traz sessões abertas de antes (busca por `session_id`) | queries: `consulta do dia inclui o histórico das sessões do dia`, `consulta do dia passado traz também o que a sessão fez depois`, `sessão com vários eventos no dia é buscada uma vez só`, `dia sem eventos não busca sessões`, `sessões do dia são buscadas em lotes de 50`, `erro na busca das sessões falha a carga do dia` | passou | |
| R56 | Sem limite fixo de 5.000 (páginas de 1.000; para na incompleta; erro na página 2 falha com a mensagem do Supabase, sem dados pela metade) | queries: `consulta pagina até trazer tudo`, `consulta com página cheia pede mais uma e para na vazia`, `consulta sem eventos faz uma chamada só`, `erro na segunda página falha a consulta com a mensagem do Supabase`, `resposta sem dados e sem erro também falha, sem devolver parcial` | passou | os 2.500 eventos em 3 chamadas estão no teste de paginação |
| R57 | Tokens da semana por dia, no banco (`my_week_tokens` soma por dia local sem dobrar) | Teste SQL manual: `supabase/tests/003_week_tokens.sql` (termina em `rollback`). Em JS há só `semana do banco vira lista por dia em valores absolutos` e `semana ignora dia fora do seletor…` (queries), que testam a conversão da linha do RPC, não o SQL | **faltando** | SQL não executado: a migration `003_v2_2.sql` e o teste SQL não rodaram neste ambiente (o próprio `F2-implementacao.md` registra que o dono precisa rodar). |

## Contagem (F2)
- Linhas F2: **6** (R52–R57)
- **passou: 5**
- **falhou: 0**
- **faltando: 1** (R57, execução SQL no Supabase)

## Veredito
**VERMELHO** por 1 linha faltando (R57): a parte JS está verde (171/171, `tsc` limpo), mas a regra de tokens da semana no banco só está provada quando `supabase/tests/003_week_tokens.sql` rodar no SQL Editor e mostrar `OK: my_week_tokens soma por dia local sem contar em dobro`. Não há falha de código.
