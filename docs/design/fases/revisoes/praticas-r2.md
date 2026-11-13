REVISÃO DE BOAS PRÁTICAS — mapa-vivo-v2-2 @ bffe877 · rodada 2

tsc OK; vitest 404/404.

Achados da rodada 1
1. buildWeekTokens: removida (board.ts) — resolvido.
2. describeCallGroup: ligada ao card (callsSummary) e ao detalhe (summaryText), com teste — resolvido.
3. eventSource.ts: casts removidos; cliente tipado por src/lib/database.ts — resolvido.
4. MapView: eslint-disable saiu; ações por useLatestRef; useCanvasWidth e useFocusOnSelected extraídos — resolvido.
5. exports sem uso (addDays, daysBetween, conversationUsage) — resolvido.
6. Commits sem escopo — os novos usam `docs(painel)`; os antigos ficam.

Achados novos
- [MENOR] src/lib/card-model.ts:106,168 — `callsSummary?` opcional em CardParts e `?? null` no retorno; deixar o campo obrigatório em sessionParts.

VEREDITO: APROVADO
