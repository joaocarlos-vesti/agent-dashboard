REVISÃO DE LÓGICA — Painel de agentes F1 @ 7667567 · rodada 3

Escopo: 29f5acd..7667567. Vitest 138/138, `tsc --noEmit` limpo. Os casos de borda foram rodados no `board.ts` empacotado com o rolldown no scratchpad.

Achados da rodada 2
- N1: parcial. Funciona para agente de workflow, cuja ferramenta `Workflow` fecha na hora e deixa só o subagente com ferramenta em andamento. Não funciona para o subagente chamado pela ferramenta `Agent`, o caso de um revisor avulso. Ver N4.
- N2: corrigido. O `idle_prompt` sem nenhum evento de trabalho depois dá "sua vez desde" o horário do aviso, e o R2 continua certo (Stop às 11:20 seguido de idle dá "sua vez desde 11:20"; rodei). O `lastAt`, os grupos, as marcas de dia e os tokens ignoram o aviso.
- N3: aceito o adiamento para a F2, junto com o R55. Sem a consulta da sessão inteira, a regra não tem como acertar.

Achados novos
N4. [IMPORTANTE] src/lib/board.ts, `ownerOfNotice`. Enquanto o subagente roda, a conversa principal fica com a ferramenta `Agent` em andamento, então há dois candidatos (a conversa principal e o a1) e o aviso fica com a conversa principal. Entrada: PreToolUse(Agent), SubagentStart a1, PreToolUse(a1, Bash), Notification permission_prompt sem agent_id, PostToolUse(a1, Bash), PostToolUse(a1, Read). Resultado: "waiting" desde 11:36 mesmo depois da aprovação (rodei). O estado só sai quando o agente termina ou depois de 2 h, e conta no título da aba.
   Corrigir em: `ownerOfNotice`. Ao escolher o dono do aviso, ignorar as origens cuja ferramenta em andamento delega trabalho (`Agent`/`Task`), porque quem espera um subagente não pede permissão. Teste com a entrada acima.
N5. [MENOR] src/lib/board.ts, `pendingIdleOf`. Sessão aberta sem nenhum pedido (SessionStart seguido de idle_prompt) mostra "terminou há 4 min", entra na faixa e acende o ponto da aba, sem ter feito nada.
N6. [MENOR] src/lib/board.ts, `sessionStateAt`. A expiração agora conta 2 h a partir do próprio aviso, mesmo com outros eventos chegando. A spec diz "sem nenhum evento por 2 h". A mudança é razoável, mas falta registrar a decisão na spec.

Conferido sem achado: R2; Esc seguido de idle; aviso com dono subagente (workflow); dois candidatos com ferramenta em andamento; aviso de permissão seguido de idle continua "aguardando"; `buildWeekTokens` ignora o idle.

VEREDITO: REPROVADO
