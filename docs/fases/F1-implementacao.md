# F1 — Regras de estado, tempo e tokens por dia

Branch `feat/mapa-vivo-v2-2`, base `c335f45`. Sem push.

## Arquivos
| Arquivo | O que entrou |
|---|---|
| `web/day.js` (novo) | dia local por fuso, limites do dia em UTC, seletor de 7 dias, "agora" efetivo (dia passado / painel caído), textos de início, continuação e retomada |
| `web/activity.js` (novo) | batimento (20×30 s), ritmo (40×15 s) e ritmo de sessão encerrada, "agiu há ≤ 12 s", estado da linha, ações por dia, números do mostrador |
| `web/attention.js` (novo) | itens da faixa de atenção, ordem, texto de "tudo certo" |
| `web/usage.js` | reprovação (trecho de 160), mediana, fora da curva, tokens da conversa por dia (diferença entre `Stop`s), semana por dia |
| `web/board.js` | estados `waiting`/`your_turn`/`stale`/`running`/`ended`, grupos `openIdle`/`endedToday`, ordem por início, tokens/ações por dia, marcas de dia, rótulos, `hiddenDone`/`visibleAgents`, `lit`, `actionAt`; opções `{ timeZone, day, connected, lastUpdateAt }` |
| `web/format.js` | tempo relativo, horário exato, verbo de ação, pasta, `tabIndicator`, texto de tokens do painel, resumo do agente |
| `web/app.js`, `web/index.html` | só o mínimo para não quebrar com os nomes novos (`idle` → `waiting`/`your_turn`); a tela nova é F3 |
| `web/*.test.js` | `board`, `format` (ajustados) + `day`, `activity`, `attention`, `usage` (novos) |

`ui-state.js` fica para a F3 (plano: testado lá). Nenhuma dependência nova.

## Linha da matriz × teste
Todos os testes estão em `web/<módulo>.test.js` com o nome da matriz.

| Linhas | Teste (arquivo) |
|---|---|
| R1–R3 | `aguardando só com pedido de permissão`, `pergunta direta…`, `aviso que não é permissão…`, `Stop deixa a sessão na sua vez` (board) |
| R4–R6 | `aguardando há 2 h vira sua vez`, `sua vez recente tem destaque`, `sua vez antiga perde o destaque` (board) |
| R7–R11 | `sessão rodando sem evento há mais de 10 minutos…`, `ferramenta em andamento só fica sem sinal depois de 2 horas`, `sessão com SessionEnd…`, `evento novo tira a sessão…`, `agente termina como concluído` (board) |
| R12–R14 | `título conta só quem aguarda permissão`, `ícone da aba com ponto…` (format); `sessão parada de ontem…`, `pedido de permissão de ontem ainda conta…` (board) |
| R15–R17 | `evento entra no dia local…`, `limites do dia local em UTC`, `seletor tem 7 dias` (day) |
| R18–R21 | `tokens do dia não dobram…`, `tokens do agente entram no dia do término`, `ações do dia contam…`, `semana soma os dias…` (board); `semana lista cada dia…` (usage) |
| R22–R26 | `sessão iniciada ontem leva a marca de início`, `…marca de continuação`, `sessão aberta sem evento hoje…`, `evento novo hoje traz a sessão de volta…`, `sessão sem o início guardado avisa` (board) |
| R27–R31 | `batimento…`, `ritmo…`, `ritmo de sessão encerrada…`, `agente agiu há 12 s…` (activity); `workflow e sessão acendem…`, `batimento e ritmo … somam os agentes abaixo` (board) |
| R32–R36 | `mediana…`, `chamada acima do dobro…`, `o dobro exato…`, `duas chamadas…`, `veredito REPROVADO…`, `APROVADO e "nenhum REPROVADO"…`, `total de reprovadas…` (usage); `reprovação vem do resultado…` (board) |
| R37–R43, R75 | `faixa lista reprovação recente`, `…sem nova ação há 10 min`, `…sem sinal`, `…sua vez só até 30 min`, `quem aguarda você vem primeiro`, `faixa ignora o que não pede ação`, `sem fatos a faixa diz tudo certo`, `sessão sem sinal não repete os agentes` + extras de P5 (attention) |
| R44–R46 | `mostrador conta agentes…`, `…ações do último minuto`, `…soma tokens só de hoje` (board) |
| R47–R51 | `workflow grande esconde concluídos…`, `workflow com 6 agentes…`, `ordem não muda…`, `aguardando sobe na faixa sem reordenar o mapa`, `sessões encerradas vão para o grupo recolhido` (board) |
| R58–R61 | `tempo relativo`, `horário exato…`, `ação vira verbo`, `pasta pelo nome final`, `painel mostra tokens de hoje e da sessão inteira` (format) |
| R62–R65, R67, R68, R70 | já existiam (`format`, `board`, `send`); R68 ganhou o caso "sessão 0 → sem %" (usage), R67 o caso "1 caractere diferente" (board) |
| R66, R77 | `agente de workflow recebe rótulo da tarefa`, `textos da tela não mostram ids` (board) |
| R69 | `resumo do agente` (format) |
| R71–R72 | `sessão nova hoje conta tudo; sem início guardado…`, `queda do acumulado não gera tokens negativos` (board) |
| R73–R74 | `dia passado usa o fim do dia como agora`, `com o painel desconectado…` (board e day) + `painel congelado não acende nada` |
| R76 | `linha segue a atividade do filho` (activity), `linha do agente acompanha…` (board) |

## Falhas vistas antes (fase vermelha)
Criei módulos-stub com os nomes finais (retornando `undefined`/vazio) e as asserções antes de implementar. Resultado: `116 testes, 38 passaram, 78 falharam`.
- 66 por `ERR_ASSERTION` (valor errado/ausente).
- 12 por `TypeError` ao ler campo novo ainda inexistente no objeto do board (`tokens.day`, `openIdle`, `hiddenDone`, `actionAt`…): comportamento ausente, não erro de import nem de digitação.
- Os 38 que passaram eram regressões já cobertas (formatação de tokens, grupos por tipo, silentSince, etc.) e alguns casos negativos vacuamente verdes (ex.: "faixa não repete…" com stub `[]`); todos continuam verdes depois.
- Dois erros de fixture meus apareceram na implementação e foram corrigidos no teste (hora `T24:00` inexistente; `startAgent` sem `session_id` no teste da faixa).

## Verde
`npm test`: 116 testes, 116 passam, 0 falham.

## Testes antigos alterados por decisão da spec
- `sessão cujo último evento é Stop está aguardando o usuário` (`idle`) → `your_turn` (R3, correção do bug).
- Teste de `permission_prompt` (`idle`) → `waiting`; teste de `idle_prompt` removido como "aguardando": agora o aviso é ignorado e vale o `Stop` (R2 + resposta 1).
- `agente rodando mostra a última ação`: `Bash: npm test` → `rodou npm test` (R59).
- `tokens da sessão…`: ganhou `SessionStart` no início (sem ele o primeiro `Stop` é só a base, R71); o resultado esperado é o mesmo.
- Helper `firstSession` lê os três grupos (`sessions`, `openIdle`, `endedToday`) por causa dos grupos novos.
- `pageTitle` continua; `tabIndicator` é o novo ponto de entrada (R12/R13).

## Decisões que a spec não fechava
1. **Estados:** `Notification` conta como aguardando só para `permission_prompt` e `elicitation_dialog` (resposta 1 + sugestão P1). `idle_prompt` e `agent_needs_input` são ignorados (o `Stop` já dá "sua vez"). Aguardando passa a "sua vez" depois de 2 h sem evento (R4), com rótulo `sua vez desde HH:MM`.
2. **`source` do `SessionStart`:** a coluna não existe no banco e o hook não a envia. O código lê `summary === 'resume'` no `SessionStart` (R22/R26). **F2 precisa fazer o `send.sh` gravar `.source` no `summary` do `SessionStart`**; sem isso nada é tratado como retomada e `startMissing` só dispara pelo caso "primeiro evento antigo sem SessionStart".
3. **`startMissing`:** `SessionStart` com `resume` como primeiro evento, ou primeiro evento que não é `SessionStart` e cai 6+ dias antes de hoje. Sem `SessionStart` guardado, o primeiro `Stop` vira só a base (R71).
4. **Queda do acumulado (R72):** por campo, se o acumulado atual é menor que o anterior, o gasto é o próprio valor atual (conversa recomeçou do zero). Exemplo 160 → 20 → 35 mil = 195 mil (160 + 35), nunca negativo.
5. **Tokens da sessão** = base (só sem início) + soma das diferenças entre `Stop`s; coincide com o último acumulado quando não há queda.
6. **Tokens do dia/semana** são calculados sobre os eventos até o "agora" efetivo da vista (numa vista passada, até o fim do dia).
7. **Retomada (R25):** `resumedAt` só aparece quando o intervalo entre o último evento antes do dia e o primeiro do dia passa de 10 min (evita "retomada às 00:01" numa sessão que atravessou a meia-noite trabalhando).
8. **Rótulo do agente de workflow:** 4 primeiras palavras da tarefa (resposta 8, sem tirar verbo); sem tarefa, `agente N` (posição no workflow). Agente avulso: tipo, ou `agente N`.
9. **Reprovação:** `REPROVADO` em maiúsculas, não precedido de "nenhum/sem/não". Trecho = resultado até 160 caracteres. Na faixa: agente de workflow até o workflow terminar; avulso 30 min (resposta 5); só sessões do mapa e não encerradas/sem sinal.
10. **Faixa:** ordem `waiting`, `your_turn`, `rejected`, `silent`, `stale`, e dentro do tipo o mais novo primeiro. "Sem nova ação" só aparece com a sessão `running`. Sessões das áreas recolhidas não entram.
11. **Grupos do board:** `sessions` (mapa), `openIdle` (sua vez/sem sinal sem evento no dia), `endedToday`; encerrada sem evento no dia some. `waiting` sem evento no dia continua no mapa (R14). Ordem de cada grupo: hora do primeiro evento, crescente.
12. **Congelado:** vista de dia passado ou painel desconectado → `lit` é sempre `false`.
13. **Formato:** `formatRelativeTime` < 1 min "agora", acima de 24 h "há N dia(s)"; `startedLabel` e `continuationLabel` são relativos ao dia de hoje real; "continua em dd/mm" quando não é hoje nem ontem.
14. **API do mostrador:** `gaugeSummary(sessions, now)` recebe a lista de sessões (`allSessionsOf(board)`), para `activity.js` não importar `board.js`.
15. **`tabIndicator(sessions)`** devolve `{ title, dot }`; o ponto vale para "sua vez" recente mesmo com outras sessões aguardando.

## Riscos
- O `summary` do `SessionStart` ainda não leva o `source` (ver decisão 2) — dependência da F2.
- R72 pode contar em dobro se o `/compact` mantiver mensagens antigas no transcript; confirmar com sessão real.
- `startMissing` pode avisar à toa numa sessão cujo hook foi instalado no meio dela com 6+ dias; improvável pelo prazo de 7 dias.
- `app.js` só foi ajustado para não quebrar; mostra os três grupos juntos até a F3.
- Fora de F1: R52–R57 (F2), R78–R82 (F3).
