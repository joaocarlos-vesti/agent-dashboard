REVISÃO DE LÓGICA — Painel de agentes F1 @ a1a7795 · rodada 1

Base c335f45..a1a7795. `npm test`: 116/116 verdes. Casos de borda conferidos rodando `buildBoard`/`weekTokens`/`dayBounds` direto no node, sem criar arquivo.

Critérios da fase
- R1, R3–R13, R15–R20, R22–R51, R58–R71, R73–R77: atendidos (board.js, day.js, activity.js, attention.js, usage.js, format.js), com as ressalvas dos achados 3 a 7.
- R2 / Resposta 1: parcial. `idle_prompt` é ignorado e vale o `Stop` (board.js:20,26). Mas `agent_needs_input` também deixou de contar como "aguardando". Ver achado 2.
- R14: parcial. Está certo às 09:00, errado perto da meia-noite. Ver achado 4.
- R21: parcial. A soma está certa, mas só para sessões que aparecem no dia visto. Ver achado 3.
- R72: não atendido. Ver achado 1.

Achados
1. [BLOQUEANTE] web/usage.js:84-87 (`growthSince`) e web/board.test.js:365-374. Quando o acumulado cai, o código soma o valor atual inteiro, como se a conversa recomeçasse do zero. Entrada: Stops de 160 mil, depois 20 mil, depois 35 mil. Resultado: 195 mil (160 + 20 + 15). A Resposta 2 diz que "a base recomeça daquele ponto, somando o já gasto", ou seja, 160 + 0 + 15 = 175 mil. O teste trava o valor errado (195 mil), e a decisão 4 do relatório contradiz a Resposta 2.
   Corrigir em: `growthSince`. Na queda, o campo contribui 0 (`current < previous ? 0 : current - previous`), e `previous = current` já recomeça a base. O teste passa a esperar 175000 em `tokens.day` e em `tokens.conversation`.
2. [IMPORTANTE] web/board.js:20. O código antigo tratava `agent_needs_input` como "aguardando". Agora ele é descartado em `isRelevantEvent` (board.js:26). Entrada: `PreToolUse` seguido de `Notification "agent_needs_input: …"`. Resultado: "rodando" (até 2 h), quando a Resposta 1 manda contar a pergunta direta ao dev. A spec não autorizou tirar esse tipo; quem sugeriu foi a P1, que fala só de `idle_prompt`. A ferramenta `AskUserQuestion` tem o mesmo risco: se ela não gerar um `Notification`, a pergunta fica como "rodando há N min". Isso não foi medido.
   Corrigir em: `WAITING_NOTIFICATION_TYPES`. Incluir `agent_needs_input`, ou registrar na spec a decisão do dono. Medir o que chega numa `AskUserQuestion`, e adicionar o teste correspondente.
3. [IMPORTANTE] web/usage.js:107 (`weekTokens`) com web/board.js:225. A semana é somada sobre `allSessionsOf(board)`, e `groupOfSession` descarta a sessão encerrada sem atividade no dia visto. Entrada: sessão com SessionStart, Stop de 100 mil e SessionEnd, tudo ontem, vista de hoje. Resultado: semana = 0 (o esperado é 100 mil). Rodei e confirmei. Na vista de ontem, a semana também perde os tokens de hoje, porque os eventos depois de `now` são cortados (board.js:99): 100 mil em vez de 160 mil. O teste do R21 só passa porque a sessão tem atividade hoje.
   Corrigir em: a semana não pode depender do agrupamento do dia. Duas saídas: o `buildBoard` expõe todas as sessões, calculadas até o agora real; ou a semana fica só com a RPC do R57 e o `weekTokens` sai. Acrescentar ao teste o caso "sessão encerrada ontem entra na semana".
4. [IMPORTANTE] web/format.js:75-79 com web/app.js:44 (R14). O `tabIndicator` recebe também as sessões do grupo `openIdle`. Entrada: Stop às 23:50, agora 00:10. A sessão vai para `openIdle`, mas fica `recent: true`, e o resultado é `dot: true` (rodei). Isso contraria o R14 ("fora do título e do ponto"). Além disso, a faixa não lista essa sessão, então o ponto aparece sem nada clicável.
   Corrigir em: o `tabIndicator` passa a receber só `person.sessions` (mapa), ou a decisão de grupo entra antes. Teste com o horário 00:10.
5. [MENOR] web/board.js:99. Na vista ao vivo, o filtro `created_at <= now` usa o relógio do navegador, mas o `created_at` vem do `now()` do Supabase. Se o relógio local estiver atrasado em relação ao do Supabase, o evento recém-chegado some até o próximo render (30 s no app.js). Filtrar só quando `view.frozen`.
6. [MENOR] web/board.js:90. O "retomada às" exige mais de 10 min de intervalo. Entrada: Stop às 23:55 e retomada às 00:03. A sessão passou por `openIdle` às 00:01 e volta ao mapa sem a marca. A condição deveria ser "o estado antes do dia era sua vez ou sem sinal".
7. [MENOR] web/board.js:82. Fora da janela de 6 dias, o primeiro Stop guardado sem `SessionStart` conta inteiro no dia. Entrada: hook falhou no início, sessão de 3 dias atrás. Até a F2 (R55), isso acontece com toda sessão que começou antes da janela de 24 h do app.js.
8. [MENOR] web/day.js:47-51. No dia que começa sem meia-noite local (America/Santiago, 06/09/2026), `dayBounds.from` sai 1 h antes (03:00Z, em vez de 04:00Z). Não afeta São Paulo.
9. [MENOR] web/board.test.js:73-77. O R8 testa 1 h e 2 h + 1 s. Um limite errado entre esses dois valores (ex.: 90 min) passaria. Acrescentar o caso 7199 s → `running`.

Fora da fase (registro): o `send.sh` corta o resultado do `SubagentStop` em 160 caracteres. Por isso, um "VEREDITO: REPROVADO" no fim de uma resposta longa nunca é detectado. O `source` do `SessionStart` precisa entrar no plano da F2, e hoje o plano não o cita.

Conferido sem achado: 2 h e 30 min (limites inclusivos corretos); 10 min / 2 h do sem sinal; corte por dia no fuso local (Intl, horário de verão de NY e de Londres ok); tokens do agente no dia do término; R18/R61 sem dobrar; batimento, ritmo e ritmo encerrado; aceso ≤ 12 s e a propagação dele para o workflow e a sessão; faixa (ordem, 30 min do avulso, até o fim do workflow, sem repetição); mediana e fora da curva; rótulos sem id; `hiddenDone`.

Perguntas de produto: no workflow com agentes em paralelo, um pedido de permissão é "apagado" pelo próximo evento de um agente irmão, que leva de volta a "rodando". Deve ficar "aguardando" até a ação do dev?

VEREDITO: REPROVADO
