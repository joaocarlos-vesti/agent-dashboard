REVISÃO DE LÓGICA — Painel de agentes F1 @ 90dda2f · rodada 4

Escopo: 7667567..90dda2f. Eu mesmo rodei `npm test` (140/140) e `tsc --noEmit` (limpo). Os casos de borda foram rodados no `board.ts` empacotado com o rolldown no scratchpad.

Achados da rodada 3
- N4: corrigido. `ownerOfNotice` deixa fora dos candidatos a origem que está com `Agent`/`Task` em andamento. No caso Agent → a1 Bash → aviso, a sessão fica "waiting" e, depois que o a1 age, passa a "running" (rodei). Há teste novo.
- N5: corrigido. `pendingIdleOf` exige que a sessão tenha tido trabalho antes. SessionStart seguido de idle fica "running" e, depois de 10 min, "stale", como era antes da F1.
- N6: registrado na spec (docs/spec.md:100).

Vizinhança conferida: R2 (Stop às 11:20 seguido de idle dá "sua vez desde 11:20"); Esc seguido de idle dá "sua vez desde 11:20"; pedido de permissão da própria `Agent` (zero candidatos) fica com a conversa principal e sai com o PostToolUse(Agent); os testes de dois candidatos e de expiração continuam verdes.

Achados novos: nenhum.

Fica para a F2: N3, com o R55.

VEREDITO: APROVADO
