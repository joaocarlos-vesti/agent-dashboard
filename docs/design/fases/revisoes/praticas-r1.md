REVISÃO DE BOAS PRÁTICAS — mapa-vivo-v2-2 @ 63c126d · rodada 1

Verificação por leitura/grep: sem `any`, `!`, `@ts-*`, `(await x()).y()`; nomes genéricos só em callbacks curtos de `.map/.filter` (aceitável). SQL: toda função security definer tem `set search_path`, helpers internos revogados, `my_*` checam `is_member()` e `my_login()`. send.sh sempre sai 0, curl com timeout em background.

Achados
1. [IMPORTANTE] src/lib/board.ts:388 — `buildWeekTokens` só é chamada no teste (a semana vem do RPC `my_week_tokens`). Código morto + teste que protege código morto.
   Correção: apagar a função e o teste em board.test.ts.
2. [IMPORTANTE] src/lib/format.ts:95 — `describeCallGroup` só é usada em format.test.ts. Código morto.
   Correção: apagar função e teste (ou usar na UI).
3. [IMPORTANTE] src/eventSource.ts:9,12,21,28,36 — `data as AgentEvent[] | null` cala o compilador em dado externo; `rows`/`key` dos `rpc` vêm como `any` implícito e são atribuídos a tipos fixos sem validação.
   Correção: tipar o cliente (`createClient<Database>`) ou validar na fronteira com type guard.
4. [IMPORTANTE] src/components/map/MapView.tsx:84-89 — `eslint-disable react-hooks/exhaustive-deps` esconde `actions` fora das deps (handler pode ficar velho). MapCanvas também mistura largura, alturas, foco e desenho (~140 linhas).
   Correção: `actions` em ref estável (ou useCallback no pai); extrair `useCanvasWidth` e `useFocusOnSelected` para src/hooks.
5. [MENOR] src/lib/usage.ts:96 `conversationUsage`; src/lib/day.ts:38-39 `addDays`/`daysBetween` — exportadas sem uso externo. Tirar `export`.
6. [MENOR] Commits `docs: ...` (6) sem escopo; usar `docs(painel)`.
7. [MENOR] hook/send.sh:~72 — `-d "$payload"` põe a chave de ingestão nos argumentos do curl (visível em `ps`). Usar `--data-binary @-` com o payload por stdin.

Dívida que já existia (não corrigir nesta tarefa): nenhuma identificada.

VEREDITO: REPROVADO
