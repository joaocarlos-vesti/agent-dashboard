VERIFICAÇÃO INDEPENDENTE — Painel de agentes (matrizes R1–R82 e T1–T64) @ e883f25

Escopo: as linhas que não são só "navegador". São 82 R e 51 T, num total de 133. Ficaram de fora T12–T15, T18, T21, T26, T38–T41, T55 e T56.
A suíte roda inteira e passa no HEAD: 21 arquivos, 404 testes (`npx vitest run`).
Durante a verificação entraram `2d6f6ca`/`bffe877`, com `tabSessionsOf`, `outsideDayFilter`, os limites exatos de 30 min e 10 min e a queda do acumulado na virada do dia. Esta verificação já considera esses commits.

## Regras de negócio (R)

| Critério | Veredito | Por quê |
| --- | --- | --- |
| R1 | forte | `board.test.ts:28`: se o aviso de permissão deixar de ser `waiting`, a asserção de status e `waitingReason` falha |
| R2 | forte | `board.test.ts` "aviso que não é permissão": se o `idle_prompt` contar como aguardando, ou se o "desde" vier do aviso, falha (exige 11:20, a hora do Stop) |
| R3 | forte | Stop → `your_turn` e `waitingReason` null; o bug antigo, que marcava `waiting`, é pego |
| R4 | forte | 11:59 → waiting e 12:00:01 → your_turn. Mais "expira 2 h depois do próprio aviso" com atividade de irmão, e "vira sua vez desde 10:00". O limite fica preso a ±30 s; o instante exato (12:00:00) não é testado |
| R5 | forte | 29 min → recent e "terminou há 29 min"; agora também 30 min exatos → recent |
| R6 | forte | 1801 s → not recent; o rótulo "sua vez desde 11:20" é conferido |
| R7 | forte | 599 s → running, 601 s → stale |
| R8 | forte | 7199 s → running, 7201 s → stale; o "rodando há 1 h" é conferido. Agente sem ferramenta em andamento também conta (via `attention.test.ts`, silêncio de 14 min sem virar stale) |
| R9 | forte | SessionEnd → ended |
| R10 | forte | Stop→PreToolUse e permissão→PostToolUse viram `running`, com `waitingReason` null |
| R11 | forte | SubagentStop → done |
| R12 | forte | `format.test.ts`: 2 waiting + 3 your_turn recentes → "(2)"; contar your_turn infla o número e o teste falha |
| R13 | forte | ponto só com your_turn recente; um waiting não acende o ponto |
| R14 | forte | Agora usa `tabSessionsOf`, a mesma função que o hook usa (`useDashboardView.ts:42`), em vez de copiar a seleção. Cobre ontem 23:50 visto 00:10 (openIdle fora do ponto) e waiting de ontem contando no título |
| R15 | forte | 01:30Z → 11/11 em SP; com a conta em UTC daria 12/11 |
| R16 | forte | limites 03:00Z; tem também o caso de dia sem meia-noite (Santiago) |
| R17 | forte | 7 dias, rótulos "Hoje", "Ontem", "ter 10" … "sex 6" |
| R18 | forte | SP com Stop às 23:00 local (02:00Z do dia 12): se o corte fosse em UTC ou se o dia somasse o acumulado, o resultado `{11:100000, 12:60000}` falharia |
| R19 | forte | agente iniciado ontem e terminado hoje às 00:10 → só hoje |
| R20 | forte | 5/3 por dia local |
| R21 | fraco | `usage.test.ts:198` prova `weekTokens` com duas "sessões" montadas à mão. Em produção a semana vem do SQL `week_tokens_of` (`useWeekTokens.ts:16` → `weekTokensFromRows`, que passa uma pseudo-sessão só). O "sem contar em dobro" da semana real mora no SQL, que só tem prova manual (R57) |
| R22 | forte | "ontem às 22:40", "há 3 dias, às 22:40", null hoje; `resume` não conta como início |
| R23 | forte | vista de ontem → "continua hoje"; vista de hoje → null |
| R24 | forte | your_turn e stale de ontem → openIdle; ended de ontem some |
| R25 | forte | "retomada às 09:12"; um teste à parte cobre "seguia trabalhando na virada → sem marca" |
| R26 | forte | Segue o texto novo da spec (`bffe877`): sem SessionStart ou com `resume` → startMissing |
| R27 | forte | barras [0]=1 e [19]=2, total 3; 601 s fica fora |
| R28 | forte | coluna 39 = 2, o resto zerado |
| R29 | forte | `endedRhythm`: colunas 0/1/39 com janelas de 60 s. O detalhe ancora no `endedAt` (`detail-model.ts:106`) |
| R30 | forte | 12 s → true, 13 s → false |
| R31 | forte | agente, workflow e sessão acesos, irmão apagado |
| R32–R34 | forte | [10,20,41] marca só 41; [10,20,40] não marca nada; [10,100] não marca nada |
| R35 | forte | REPROVADO com trecho; APROVADO e "nenhum REPROVADO" → null; o trecho de 160 é conferido |
| R36 | forte | `rejectedCount` 2 no grupo e nenhuma chamada com total próprio |
| R37 | forte | workflow: fica até `UserPromptSubmit`; avulso: 29 min fica, 31 min sai |
| R38 | forte | 600 s entra ("há 10 min") e 599 s fica fora; ferramenta em andamento não conta |
| R39 | forte | sessão stale → item |
| R40 | forte | 3 min entra, 31 min fica fora |
| R41 | forte | waiting vem antes de rejected, mesmo com o rejected mais novo |
| R42 | fraco | `attention.test.ts` "faixa ignora…": a sessão "antiga" é your_turn **não recente**, e isso já dá null em qualquer grupo. Se `attentionItems` passasse a usar `allSessionsOf` em vez de `person.sessions` (`attention.ts:43`), nenhum teste falharia. A sessão aberta e sem sinal de ontem entraria na faixa |
| R43 | forte | texto exato; com item → null |
| R44 | forte | 12 s, 5 s e 13 s → 2 |
| R45 | forte | 30 s, 59 s e 61 s → 2 |
| R46 | forte | duas sessões de dois dias → 120 mil; somar em dobro daria 320 mil |
| R47 | forte | 8 agentes → 4 visíveis e 4 escondidos; o REPROVADO continua visível |
| R48 | forte | 6 agentes → 0 escondidos |
| R49 | forte | A, B continua A, B com B em waiting |
| R50 | forte | faixa com B, mapa com A, B |
| R51 | forte | 2 ended → endedToday |
| R52 | forte | `hook/send.test.ts`: o `send.sh` real roda contra git real (branch, sem git, HEAD solto, pasta inexistente) |
| R53 | forte | branch do início; a retomada em outra branch fica com a mais recente |
| R54 | forte | `dayFilter` de ontem em SP |
| R55 | forte | busca por sessão com o filtro "fora do dia", e agora a string `.or` exata (`outsideDayFilter`), que o `eventSource.ts:10` usa |
| R56 | forte | 2.500 em 3 chamadas; erro na página 2 falha com a mensagem |
| R57 | sem prova automática | `supabase/tests/003_week_tokens.sql` é manual e o Andamento diz que ainda não rodou. É a única prova da semana real (R21) |
| R58 | forte | "agora", "há 3 min", "há 2 h"; `exactTime` "12/11 14:32" |
| R59 | forte | verbos e caminho → nome final; ferramenta desconhecida fica como veio |
| R60 | forte | nome final, inclusive com barra no fim |
| R61 | forte | "hoje: 60 mil · sessão inteira: 160 mil" |
| R62 | forte | 999600 → "1 mi", null → "—" |
| R63 | forte | `primary` 150 com cache à parte |
| R64 | forte | `send.sh` real com `message.id` repetido 3× |
| R65 | forte | 2 tipos → 2 grupos |
| R66 | forte | 4 palavras e "agente 2/3" |
| R67 | forte | 60 caracteres iguais juntam; diferença no caractere 60 separa |
| R68 | forte | o denominador é conversa + agentes (0,5); usar só a conversa daria 1,33 |
| R69 | forte | `describeCallGroup` nos singulares e plurais, e agora no card (`card-model.test.ts` callsSummary) |
| R70 | forte | `UserPromptSubmit` com o `runId` → done |
| R71 | forte | sessão nova conta tudo; sem início guardado conta só a diferença a partir do 2º Stop |
| R72 | forte | 160→20→35 dá 175 mil, nunca negativo; vale também na virada do dia. Ver a pergunta 1 |
| R73 | fraco | `board.test.ts` "dia passado usa o fim do dia" confere só o status. O critério também diz "nada aceso", e o único teste de `lit:false` usa `connected:false`. Se `frozen` deixasse de incluir o dia passado para o `lit` (`board.ts:289/326`), nenhum teste pegaria |
| R74 | forte | 14:32 congelado → running; sem congelar → stale |
| R75 | forte | sessão stale com 2 agentes → 1 item |
| R76 | forte | `lineState` e o board |
| R77 | forte | rótulos "Explore" e "agente 2"; sem pasta → "sessão" |
| R78 | forte | reducer. Gravar no `localStorage` (`useUiState.ts:16`) fica sem teste (hook) |
| R79–R82 | forte | reducer; o efeito de `expand` e `toggleGroup` no mapa é provado em `map-tree.test.ts` |

## Estados e interações das telas (T, sem as linhas só de navegador)

| Critério | Veredito | Por quê |
| --- | --- | --- |
| T1–T7 | forte | `screen-state.test.ts`, com os textos exatos e a precedência erro/vazio/carregando |
| T8 | forte | R78 |
| T9 | forte | texto exato; o "nada vira sem sinal" vem do R74 |
| T10 | fraco | o texto da faixa é forte. O "sem faíscas, giro e brilho" do dia passado não tem prova: o brilho é o mesmo buraco do R73, e as faíscas são cortadas no hook (`useDashboardView.ts:45`), que não é testado |
| T11 | forte | header + reducer: volta para hoje com a sessão selecionada |
| T16, T17 | forte | |
| T19, T20 | forte | ordem, tom âmbar e ícone conferidos |
| T22, T23, T25 | forte | |
| T24 | forte | abrir pelo R81; a definição é conferida só por regex (`/entrada e saída/`) |
| T27 | forte | os 6 estados com palavra, ícone e tom; só `waiting` âmbar |
| T28 | forte | "terminou há 3 min"/yourTurn; "desde 11:20"/yourTurnOld |
| T29 | forte | |
| T30 | fraco | `card-model.test.ts:81` injeta `cloudSessionIds`, mas a produção nunca passa esse conjunto (`useDashboardView.ts:40` e `:62`). O ícone de nuvem nunca aparece no app. O teste prova a apresentação de uma entrada que não existe |
| T31–T37 | forte | |
| T42 | forte | |
| T43 | fraco | a parte local é forte. A parte "na nuvem: Abrir a sessão" tem o mesmo buraco do T30 (`detail-model.test.ts:26`) |
| T44, T45 | forte | |
| T46 | fraco | `detail-model.test.ts:91` afirma "ação na sessão (10:00–10:40)"; a spec diz "sessão inteira (10:00–10:40)". O teste segue o código, não o critério |
| T47–T53 | forte | |
| T54 | fraco | `detail-model.test.ts:216` afirma um texto diferente do da spec ("O início desta sessão tem mais de 7 dias e não está mais guardado."). O motivo provável é a mudança do R26, mas a T54 não foi atualizada |
| T57 | forte | `tabIndicator` + `faviconHref` + `tabSessionsOf`, usado pelo hook |
| T58 | fraco | O sucesso só é testado a partir de uma conexão já existente (`connect-flow.test.ts:205`). Na primeira conexão da vida, o hint é "A conexão anterior foi desligada…" (`connect-flow.ts:98`, `NEW_KEY_HINT` sem olhar `hasKey`), o que é falso para esse usuário |
| T59 | fraco | só `mergeEvents` e `loadSessionEvents`. O caminho ao vivo (`useDashboard.ts:91`, o evento do canal subindo tokens) não tem prova |
| T60–T62 | forte | |
| T63 | forte | os "—" e o rótulo. Os tokens do dia passado usam o board de hoje no teste; quem prova o valor é o board ("na vista de ontem o dia é ontem") |
| T64 | forte | |

ACHADOS
1. R21/R57: a prova está no lugar errado. A semana real sai do SQL `week_tokens_of` (`supabase/migrations/003_v2_2.sql:30-83`), que reimplementa a base, a queda e o startMissing do JS sem teste automático, e o teste manual ainda não rodou. `usage.test.ts:198` prova uma função que, em produção, só recebe uma pseudo-sessão (`queries.ts:102`). Reforço: rodar `supabase/tests/003_week_tokens.sql` com os casos do R18, do R72 e do startMissing, e registrar o resultado na spec.
2. R42: asserção frouxa em `attention.test.ts` "faixa ignora o que não pede ação". Reforço: incluir uma sessão aberta e **sem sinal** de ontem (último PostToolUse ontem 23:00, now hoje 09:00) e afirmar `[]`. Hoje ela só fica fora por `attention.ts:43`, e nenhum teste falharia se a linha mudasse.
3. T30/T43: o teste passa por um motivo que não existe em produção. `cloudSessionIds` nunca é montado nem passado (`useDashboardView.ts:40,62`). O identificador da nuvem está "a confirmar" na spec. Os testes fazem parecer que a nuvem está entregue.
4. T58: exemplo não coberto. Sem chave → "Gerar conexão" → gerada: a tela diz "A conexão anterior foi desligada", e não havia conexão anterior. `connect-flow.ts:98`.
5. R73/T10: o "nada aceso" do dia passado está sem prova. Exemplo: vista de ontem, PostToolUse às 23:59:55, now = 23:59:59.999 → `lit` tem de ser false na sessão e no agente. Hoje só `connected:false` é testado (`board.test.ts` "painel congelado não acende nada").
6. T46/T54: as asserções seguem o código e divergem do texto da spec ("sessão inteira (…)" e "tem mais de 7 dias e não está mais guardado"). Pela Resposta 7, o texto da matriz é o definitivo. Decidir qual dos dois vale e alinhar a spec ou o código.
7. T59: o caminho ao vivo dos tokens, no `useDashboard.ts:80-91`, não tem prova automática; só o merge tem.
8. R56: exemplo não coberto. Com `max-rows` do Supabase abaixo de 1.000 (o Andamento ainda pede para conferir), a primeira página vem com 500 e `fetchAllPages` para em silêncio (`queries.ts:46`), mostrando dados pela metade sem erro. Isso contraria o próprio R56 ("sem mostrar dados pela metade").

Exemplos que ninguém citou (regras prioritárias)
- Aguardando/2 h: (a) aviso às 10:00, now 12:00:00.000 exato → pelo critério ("depois de 2 h") continua `waiting`; o código usa `>`, mas nenhum teste fixa isso. (b) Aviso de ontem 23:50 visto às 01:51 → `your_turn` "sua vez desde 23:50", vai para openIdle e sai do título. Só o caso das 00:30 é testado.
- Sua vez/30 min: (a) `idle_prompt` depois de Esc (sem Stop) há 31 min → não entra na faixa. A faixa só tem casos com Stop. (b) Stop às 23:45 visto às 00:10: a sessão é recente, mas vai para openIdle. A faixa não deveria listá-la, e não há teste disso (ver o achado 2).
- Tokens por dia: (a) sessão com startMissing cujo primeiro Stop guardado é de hoje → hoje 0, e o total é a base. (b) Stop sem `input_tokens` entre dois Stops com tokens → ignorado, sem zerar a base.
- Corte no fuso local: (a) 02:59:59.999Z em SP → dia anterior, no limite exato. (b) Fuso a leste de UTC (Asia/Tokyo), 2026-11-11T15:30Z → 12/11. Todos os testes usam fusos a oeste.
- Tela Conectar: (a) o achado 4. (b) `hasKey` com `keyCreatedAt` null e evento antigo → hoje vira "Conectado" (`connect-flow.ts:72`). A chave sem data aceita qualquer evento como prova de conexão.
- REPROVADO: "O PR não foi REPROVADO" conta como reprovação, porque o lookbehind de `usage.ts:34` só olha a palavra imediatamente antes.

Perguntas de produto (fora da tabela)
1. R72: depois de `/clear`, os tokens gastos até o primeiro Stop novo (os 20 mil do exemplo) não entram em nenhum dia, porque a base recomeça no valor novo. É isso que a Resposta 2 quer?
2. R1 × Resposta 1: `agent_needs_input` conta como "aguardando" e entra no título da aba (`board.ts:20`). A resposta cita só a permissão e a pergunta direta. Fica assim?

RESUMO: 122 fortes, 10 fracos, 1 sem prova automática (133 linhas fora de navegador) · 8 achados.
