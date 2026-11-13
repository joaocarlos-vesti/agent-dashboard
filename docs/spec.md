# Painel de agentes — spec da v1

**Aprovado:** 2026-11-12 — usuário: "1 - sim 2 - ok 3 - Tudo bem 4 - oK.... 5 - Ok 6 - Ok 7 - Ok 8 - Ok"

**Stack (12/11/2026):** o dono pediu React + TypeScript. Aceitas as sugestões: Vite + React + TypeScript, testes em Vitest; a F1 (JS) é convertida num passo próprio (F1b) com os mesmos testes; React Flow para posição e linhas do mapa, cards no visual do protótipo.

**Respostas (valem sobre qualquer linha "pergunta" das matrizes):**
1. "Aguardando você" = pedido de permissão e pergunta direta ao dev; ociosidade (`idle_prompt`) = "sua vez".
2. Acumulado da conversa que cai (compactar/limpar): a base recomeça daquele ponto, somando o já gasto; nunca negativo.
3. Agente rodando mostra "tokens ao terminar"; sessão e total do dia sobem ao vivo.
4. "Sobe ao topo" só na faixa de atenção; o card não muda de lugar no mapa.
5. REPROVADO fica na faixa até o workflow terminar; agente avulso, 30 min.
6. Batimento e ritmo: sessão e workflow somam os agentes abaixo; agente conta só as dele.
7. Textos de tela: as sugestões das matrizes valem como definitivas (incluindo "agora" < 1 min e "começou há N dias, às HH:MM").
8. Rótulo do agente de workflow = 4 primeiras palavras da tarefa; trecho do REPROVADO até 160 caracteres; ícone de nuvem; Esc fecha o painel na meia tela; mostrador em dia passado mostra "—" no que é ao vivo.

Andamento e decisões do produto: **o que** mostrar e **as regras** de apresentação. O visual de referência é o protótipo v2.2 do Claude Design (seção "Direção visual").

## Decisões do dono (João, 12/11/2026)

- **Tela individual.** Cada dev observa as próprias sessões. Não é ferramenta de gestão nem de comparação entre pessoas.
- **Consumo: só tokens.** O percentual do limite do plano (5 h e semanal) fica para a v2.
- **Tokens por agente**, inclusive o mesmo agente chamado várias vezes: o total dele, a parte dele na sessão e cada chamada.
- **Semana:** interessa, porque há limite semanal. Só valores absolutos por dia, nunca %.
- **Objetivo:** quem olha pensa "isso ajuda muito".

Como foi decidido: discussão entre planejador, especialista de produto e especialista de design de informação (duas rodadas), depois revisão do design com o Claude Design (v2.2).

## Perguntas que a tela responde, por ordem de importância

| # | Pergunta do dev | Em quanto tempo | Dado que responde |
|---|---|---|---|
| 1 | "Alguém está me esperando?" | 3 s | pedido de permissão (aguardando você); Claude terminou de responder (sua vez) |
| 2 | "Algo deu errado ou parou?" | 3 s | REPROVADO no resultado; tempo sem nova ação; sem sinal |
| 3 | "Em que pé está cada workflow?" | 30 s | agentes por estado, resultado de cada um, workflow concluído |
| 4 | "O que esse agente está fazendo agora?" | 30 s | tarefa e última ação, com há quanto tempo; ritmo das ações |
| 5 | "Quanto isso está custando?" | 30 s | tokens da sessão, dos agentes, do dia e da semana |

Tudo o mais (tarefa completa, lista de ações, cada chamada, detalhe do cache) fica **sob demanda**, no painel de detalhe.

## Direção visual (v2.2, "mapa vivo revisado")

Protótipo de referência: canvas "Painel de agentes", página "v2.2 — mapa vivo revisado (Mac 13″)", arquivo `project/MapaR.dc.html` (componente) e telas A–I.

### Público e larguras
- Público principal: Mac de 13". Medidas de projeto: **1440 px** (tela cheia) e **720 px** (meia tela, ao lado do terminal).
- **≥ 1280 px:** mapa + painel de detalhe fixo.
- **1100–1279 px:** painel de detalhe por cima do mapa.
- **< 1100 px:** o mesmo componente vira árvore vertical (meia tela e celular).

### Mapa
- **3 níveis:** sessão → workflow → agente. As chamadas não estão no mapa; ficam só no painel de detalhe.
- **Sem barra lateral.** No lugar:
  - **Faixa de atenção no topo:** só fatos que pedem ação (REPROVADO, sem nova ação, sem sinal, e "sua vez" recente), com botões que levam ao item. Sem nada, diz "Tudo certo".
  - **Mostrador flutuante no canto do mapa:** agentes agindo · ações no último minuto · tokens de hoje (ao vivo). Clicar em tokens abre os últimos 7 dias e a divisão por sessão do dia. O "?" abre o "Como ler", que aparece sozinho só na primeira visita.
- **Cards:**
  - Tamanho fixo por nível. **O tamanho NÃO representa tokens.**
  - A altura segue o conteúdo; nada é cortado.
  - Ordem fixa pela hora de início: nada muda de lugar quando o estado muda.
  - O pai fica alinhado ao topo do primeiro filho.
  - Workflow com mais de 6 agentes esconde os concluídos sem alerta atrás de "N concluídos · mostrar".
  - As sessões encerradas ficam recolhidas em "Encerradas hoje (N)".
- **Linhas:** curvas desenhadas a partir da posição real dos cards, medida na tela. Cinza quando paradas; tracejadas quando o agente está rodando mas sem agir agora; terracota com fluxo só onde há ação acontecendo.

### Regra do movimento: tudo que se mexe é um evento real
- Cada ação (`PostToolUse`) = uma faísca terracota que corre da origem até o agente.
- Anel girando no ícone = o agente agiu nos últimos 12 s.
- Card aceso (borda e brilho terracota) = ele ou um descendente agiu nos últimos 12 s.
- Batimento no card: 20 barrinhas = ações a cada 30 s nos últimos 10 min.
- Agente novo entra deslizando; ao concluir, uma faísca verde volta para quem o chamou.
- Tokens sobem ao vivo no card, no workflow, na sessão e no total do dia.
- **Âmbar é exclusivo de "aguardando você"** (pulso no ícone + halo).
- `prefers-reduced-motion`: os mesmos dados, sem faíscas, sem giro e sem brilho.

### Tipografia
- Uma família, **Geist**, com números tabulares. **Geist Mono** só para pasta e branch.
- Tamanhos: 12, 13, 14, 16 e 24. Pesos: 400, 500 e 600.
- Rótulos em frase normal, sem CAIXA ALTA. Exceção: REPROVADO, que vem do agente.
- A cor do estado fica no ícone e no anel. O texto só ganha cor em "aguardando você".

### Painel de detalhe (ordem das perguntas)
1. **Pedido de permissão**, se houver: onde responder (pasta + branch; na nuvem, botão "Abrir a sessão").
2. **Agora:** ritmo de 10 min (40 colunas de 15 s) e as últimas ações entrando ao vivo. Em sessão encerrada, o ritmo cobre a sessão inteira (do início ao fim).
3. **Chamadas** como barras, com a linha da mediana. "Fora da curva" = mais de 2× a mediana, só com 3+ chamadas. REPROVADO em violeta, com o trecho do motivo. O total de reprovadas aparece uma vez só.
4. **Tokens:** número grande, barra da fatia da sessão e número exato (entrada + saída) ao vivo; cache recolhido.
5. **Tarefa** por último, em 3 linhas, com "ler a tarefa inteira".
- Em sessão e workflow, os filhos viram barras de participação clicáveis.
- O cabeçalho do painel fica fixo ao rolar.

## Regras de apresentação

### Estados (6)
| Estado | Quando | Destaque |
|---|---|---|
| **rodando** | há atividade recente | — |
| **concluído** | agente terminou | — |
| **aguardando você** | **só** pedido de permissão (`Notification`) | âmbar, sobe ao topo, conta no título da aba |
| **sua vez** | o último evento da sessão é um `Stop` (o Claude terminou de responder) | até 30 min: destaque leve, entrada na faixa do topo ("terminou há 3 min") e ponto no ícone da aba, **sem número no título**; depois de 30 min: cinza ("sua vez desde 11:20") |
| **sem sinal** | sem evento há 10 min, ou 2 h com agente/ferramenta em andamento | — |
| **encerrada** | `SessionEnd` | — |

- "Aguardando você" vira "sua vez" 2 h depois do **próprio aviso**, mesmo com outros eventos chegando na sessão (decisão da rodada 3 da F1).
- **Correção de bug:** hoje o painel marca "aguardando você" quando o último evento é um `Stop`. Por isso o título da aba conta sessões paradas de ontem.
- **Fácil de trocar:** se o dono quiser, "sua vez" também passa a contar no título.
- O estado aparece sempre como **palavra + ícone**, nunca só por cor.
- REPROVADO é o resultado que o agente devolveu, não um estado. REPROVADO e "sem nova ação" ganham destaque leve e não sobem.
- **Mostrar o fato, não um veredito:** "sem nova ação há 14 min", nunca "travado" ou "falhou".
- Uma ferramenta longa ainda em execução (build, teste) conta como "rodando há X", e não como parada.
- O horário da última atualização da tela fica sempre visível. A queda de conexão do **painel** tem aviso próprio e não se confunde com "sem sinal" de uma sessão.

### Tokens
- **Número principal = entrada + saída.** O cache (mais de 90% do volume) aparece em segundo plano, com criação e leitura separadas.
- Formato curto em português ("12,4 mil", "1,2 mi"), com no máximo 3 algarismos significativos. O valor exato só aparece no detalhe.
- Toda tela usa a mesma definição de "tokens", explicada uma vez em linguagem simples (no "Como ler").
- **Por agente:** "N chamadas · total X · % da sessão · quantas reprovaram".
- **Fora da curva:** mais de 2× a mediana, só quando o agente tem 3 chamadas ou mais.
- **Semana e dias:** só valores absolutos por dia. **Nunca em percentual**, para não parecer o limite do plano (v2).

### Agrupar e nomear agentes
- **Agentes avulsos:** agrupados pelo tipo (ex.: `logic-reviewer`), que é confiável.
- **Agentes de workflow:** cada um recebe um **rótulo curto deduzido da tarefa**. O rótulo só **identifica**, não junta.
- **Somar chamadas** de agentes de workflow só quando o início da tarefa for idêntico, sempre com a marca "provável mesmo agente".
- **Nunca inventar fase.** O dado não existe.

### Texto
- Texto em inglês fica como veio.
- A pasta aparece pelo nome final, não pelo caminho.
- Tempo relativo ("há 3 min"), com o horário exato ao passar o mouse.
- Verbos de ação no lugar do nome da ferramenta ("editou spec.md", não "Edit").
- Sem identificadores técnicos à vista.

## Dias e sessões que atravessam dias
- **Medido:** `--continue` e `--resume` mantêm o mesmo identificador de sessão; o gatilho de início só informa que ela foi retomada. A sessão retomada é o mesmo nó no painel.
- **Seletor de dia no cabeçalho:** Hoje, Ontem e mais 5 dias. O máximo é 7, porque os eventos com mais de 7 dias são apagados.
- **Dia passado = mapa congelado:** faixa azul-acinzentada, nada se mexe, botão "Voltar ao vivo". O botão âmbar de quem espera você continua no topo e leva de volta para hoje.
- A sessão aparece em todo dia em que teve atividade. Cada dia conta só os eventos dele (tokens e ações). A semana soma por evento, sem contar em dobro.
- **Marcas:** "continua hoje →" no dia anterior e "← começou ontem às 22:40" hoje. No painel: "hoje: X · sessão inteira: Y".
- O "dia" é o do **fuso do navegador**, não o UTC do banco.
- **Sessão aberta sem atividade hoje** (sua vez ou sem sinal) vai para o grupo recolhido "Abertas, sem atividade hoje (N)". Ela fica fora do título da aba e volta sozinha ao mapa com qualquer evento novo, com a marca "retomada às HH:MM".
- **Sessão iniciada há mais de 7 dias:** o painel avisa que o início não está mais guardado.

## Fora da v1
- **% do limite do plano:** v2.
- **Custo em dinheiro:** a assinatura não cobra por chamada, e o número enganaria.
- **Fase atual do workflow:** o dado não existe.
- **Ações sobre os agentes** (parar, responder): a ferramenta observa, não controla.
- **Comparar pessoas.**
- **Replay** (linha do tempo arrastável): v2.

### Mudança de escopo (12/11/2026)
O ritmo de 10 min, as barras de chamadas e a semana por dia esticam o "sem gráficos" da v1. O dono decidiu manter: são indicadores de leitura instantânea, não gráficos de análise.

## Mudanças nos dados
| Mudança | Situação |
|---|---|
| Cada dev vê só os próprios eventos | Feito no código (`002_v1.sql`); falta rodar no Supabase |
| Tokens por resposta, somados por agente e por sessão | Feito no código; falta publicar |
| Aviso de permissão (`Notification`) | Feito no código; formato a confirmar no primeiro uso real |
| `PostToolUse` de toda ferramenta | Feito no código (necessário para as faíscas e o ritmo) |
| Consulta por dia local + consulta por sessão (histórico até 7 dias) | **A fazer.** Substitui a janela fixa de 24 h e resolve o limite de 5.000 eventos |
| Branch da sessão no evento de início | **A fazer**; a confirmar se dá para obter |
| Identificador da sessão na nuvem para "Abrir a sessão" | **A confirmar** |

## Fatos dos dados (medidos em 12/11/2026, Claude Code 2.1.220)
- **Chegam:** sessão (id, pasta), pedido, workflow iniciado (nome, id da execução, fases planejadas), agente iniciado/terminado (id, tipo), tarefa do agente (do registro dele), resultado, cada ação (ferramenta, resumo, duração), `Stop` a cada fim de resposta (com última mensagem e tokens acumulados), workflow concluído.
- **Não chegam:** o rótulo dado ao agente no workflow e a fase atual. Em workflow, o tipo é sempre genérico (`workflow-subagent`).
- **Tokens:** cada resposta registra `input_tokens`, `output_tokens`, `cache_creation_input_tokens` e `cache_read_input_tokens`; a mesma resposta pode se repetir em várias linhas, então a soma deduplica por `message.id`.
- **Retomada:** `--continue` e `--resume` mantêm o identificador (medido com `claude -p`).
- **% do plano:** existe internamente (usado pelo `/usage`), mas não chega aos gatilhos. Só por uma rota não oficial (v2).

### Medido em 12/11/2026 (sessão real, modo manual)
- `PermissionRequest` dispara em todo pedido de permissão, da conversa principal e de agente; é a fonte de "aguardando você".
- O pedido feito por agente chega **sem `agent_id`** (no `PermissionRequest` e no `Notification`): a atribuição por ferramenta em andamento continua necessária.
- `Notification` com `permission_prompt` disparou só uma vez, ~6 s após o primeiro pedido: apoio, não fonte.
- `SessionStart` real chegou com `summary` nulo: causa era o `send.sh` instalado na máquina, antigo; o do repositório grava a origem (`startup`). Corrige-se com deploy e rodando o comando de conexão de novo.
- A tela Conectar consulta `my_connection_status()` (migração 005) e só gera chave por botão com confirmação, porque `create_my_key()` apaga a chave anterior.

### A confirmar
- O formato exato do aviso de permissão (`Notification`) no primeiro uso real.
- ~~`--continue` no terminal interativo.~~ Medido 12/11: `--continue`/`--resume` mantêm o `session_id`; o `SessionStart` traz `source: "resume"`.
- ~~Pasta e branch disponíveis no evento de início.~~ Medido 12/11: a pasta (`cwd`) chega em todo evento, inclusive no de início; a branch sai do `git` nessa pasta.
- O identificador da sessão na nuvem, para o link "Abrir a sessão".

## Respostas do dono (12/11/2026)
1. **Aviso fora da aba:** só o título e o ícone da aba. Sem notificação do sistema.
2. **Sem nova ação:** destacar depois de **10 min**.
3. **Nuvem:** entra na v1 com o mesmo detalhe das sessões locais, inclusive tokens.
4. **O que conta no limite do plano:** em aberto, para a v2. Forma de conferir: anotar o `/usage` antes e depois de uma sessão cujos tokens o painel mediu.
5. **Título da aba:** conta só as sessões em "aguardando você" (pedido de permissão).

## Matriz de testes — regras de negócio

Funções puras, testadas com `node:test` (`npm test`). `now` e o fuso entram por parâmetro, para o teste não depender do relógio nem da máquina. Um teste por comportamento.

| # | Regra | Teste | Entrada → saída esperada | Critério da spec | Fase |
|---|---|---|---|---|---|
| R1 | Pedido de permissão deixa a sessão aguardando | `aguardando só com pedido de permissão` | último evento `Notification` `permission_prompt` → `waiting` | Estados: aguardando você | F1 |
| R2 | Outros avisos não viram "aguardando" | `aviso que não é permissão não muda o estado` | `Notification` `idle_prompt` depois de `Stop` às 11:20 → `your_turn` com "desde" 11:20 (o do `Stop`, não o do aviso; hoje o código marca `idle`). Depende da P1 | Estados: "só pedido de permissão" | F1 |
| R3 | `Stop` vira "sua vez" (correção do bug) | `Stop deixa a sessão na sua vez` | último evento `Stop` → `your_turn`, nunca `waiting` | Estados: sua vez; Correção de bug | F1 |
| R4 | "Aguardando" sem evento por 2 h vira "sua vez" | `aguardando há 2 h vira sua vez` | `Notification` permissão às 10:00, now 12:00:01 → `your_turn`; 11:59 → `waiting` | "Aguardando você sem nenhum evento por 2 h vira sua vez" | F1 |
| R5 | "Sua vez" recente tem destaque até 30 min | `sua vez recente tem destaque` | `Stop` há 29 min → `{ state: your_turn, recent: true, sinceLabel: "terminou há 29 min" }` | Estados: até 30 min destaque leve | F1 |
| R6 | "Sua vez" depois de 30 min fica cinza | `sua vez antiga perde o destaque` | `Stop` às 11:20, há 31 min → `{ recent: false, sinceLabel: "sua vez desde 11:20" }` | Estados: depois de 30 min cinza | F1 |
| R7 | Sem evento há 10 min fica sem sinal | (já existe; ajustar nome do estado) | último `PostToolUse` há 10 min e 1 s, nada em andamento → `stale` | Estados: sem sinal | F1 |
| R8 | Ferramenta/agente em andamento só fica sem sinal depois de 2 h | (já existe) | `PreToolUse` sem fim há 1 h → `running` ("rodando há 1 h"); há 2 h e 1 s → `stale` | Estados: sem sinal; ferramenta longa | F1 |
| R9 | `SessionEnd` encerra | (já existe) | último `SessionEnd` → `ended` | Estados: encerrada | F1 |
| R10 | Evento novo tira a sessão de "sua vez"/"aguardando" | (já existe; reescrever) | `Stop` → `PreToolUse` → `running` | Estados | F1 |
| R11 | Agente termina como concluído | (já existe) | `SubagentStart` → `SubagentStop` → `done` | Estados: concluído | F1 |
| R12 | Título da aba conta só "aguardando você" | `título conta só quem aguarda permissão` | 2 `waiting` + 3 `your_turn` → `"(2) Painel de agentes"` | Respostas do dono 5 | F1 |
| R13 | Ícone da aba ganha ponto com "sua vez" recente | `ícone da aba com ponto quando há sua vez recente` | 0 `waiting` + 1 `your_turn` recente → `{ title: "Painel de agentes", dot: true }`; só `your_turn` antiga → `dot: false` | Estados: ponto no ícone, sem número | F1 |
| R14 | Sessão aberta sem atividade hoje fica fora do título | `sessão parada de ontem não conta na aba` | `your_turn` com último evento ontem 23:50, now hoje 09:00 → fora do título e do ponto; `waiting` ontem 23:50 com now 00:30 (ainda < 2 h) → **conta** no título (decisão: o pedido de permissão vale até virar sua vez) | Dias: "fica fora do título da aba" | F1 |
| R15 | Dia é o do fuso do navegador | `evento entra no dia local, não no UTC` | `2026-11-12T01:30Z` com fuso `America/Sao_Paulo` → dia `2026-11-11` | Dias: fuso do navegador | F1 |
| R16 | Limites do dia local | `limites do dia local em UTC` | dia `2026-11-12`, fuso SP → `[2026-11-12T03:00Z, 2026-11-13T03:00Z)` | Dias: consulta por dia local | F1 |
| R17 | Seletor de dia: Hoje, Ontem e mais 5 | `seletor tem 7 dias` | now 12/11 → 7 dias, de 12/11 a 06/11, rótulos "Hoje", "Ontem", "ter 10"… | Dias: seletor, máximo 7 | F1 |
| R18 | Tokens do dia contam só os eventos do dia | `tokens do dia não dobram sessão de dois dias` | `Stop` ontem acumulado 100 mil, `Stop` hoje acumulado 160 mil → hoje 60 mil, ontem 100 mil, sessão inteira 160 mil (suposto, ver P2) | Dias: cada dia conta só os eventos dele | F1 |
| R19 | Agente conta no dia em que terminou | `tokens do agente entram no dia do término` | `SubagentStop` hoje 00:10 de agente iniciado ontem → tokens em hoje (os do agente só existem no `SubagentStop`; ver P3) | Dias: cada dia conta os eventos dele | F1 |
| R20 | Ações por dia sem dobrar | `ações do dia contam só os eventos do dia` | 5 `PostToolUse` ontem + 3 hoje → ontem 5, hoje 3 | Dias | F1 |
| R21 | Semana soma por evento | `semana soma os dias sem contar em dobro` | sessão com 100 mil ontem + 60 mil hoje → semana 160 mil; lista por dia em valor absoluto (sem %) | Dias: semana; Tokens: nunca % | F1 |
| R22 | Marca "← começou ontem às HH:MM" | `sessão iniciada ontem leva a marca de início` | 1º evento ontem 22:40, vista de hoje → `"começou ontem às 22:40"`; 3 dias antes → `"começou há 3 dias, às 22:40"` (**pergunta**); `SessionStart` com `source: "resume"` não conta como início | Dias: marcas | F1 |
| R23 | Marca "continua hoje →" | `sessão com eventos depois do dia leva a marca de continuação` | vista de ontem, sessão com evento hoje → `continuesAfter: "continua hoje"` | Dias: marcas | F1 |
| R24 | "Abertas, sem atividade hoje" | `sessão aberta sem evento hoje vai para o grupo recolhido` | `your_turn`/`stale` com último evento ontem → grupo `openIdle`; `ended` ontem → fora de hoje | Dias: grupo recolhido | F1 |
| R25 | Retomada volta ao mapa com marca | `evento novo hoje traz a sessão de volta com a hora` | último evento ontem 23:00, novo hoje 09:12 → no mapa, `resumedAt: "retomada às 09:12"` | Dias: retomada | F1 |
| R26 | Início fora dos 7 dias guardados | `sessão sem o início guardado avisa` | sessão sem `SessionStart` guardado → aviso de início não guardado (`startMissing: true`); `SessionStart` `resume` como 1º evento → também `startMissing: true` | Dias: mais de 7 dias | F1 |
| R27 | Batimento: 20 barras de 30 s | `batimento conta ações em 20 janelas de 30 s` | `PostToolUse` há 5 s, 10 s e 9 min 50 s → `[…0, 1 (barra 1), …, 2 (barra 20)]`, tamanho 20; ação há 10 min 1 s fica fora | Movimento: batimento | F1 |
| R28 | Ritmo: 40 colunas de 15 s | `ritmo conta ações em 40 janelas de 15 s` | ações há 3 s e 14 s → última coluna = 2; tamanho 40 | Painel: ritmo de 10 min | F1 |
| R29 | Ritmo de sessão encerrada cobre início → fim | `ritmo de sessão encerrada vai do início ao fim` | sessão 10:00–10:40 → 40 colunas de 60 s, ancoradas no `SessionEnd`, não em `now` | Painel: ritmo em sessão encerrada | F1 |
| R30 | Agiu nos últimos 12 s | `agente agiu há 12 s ou menos fica aceso` | `PostToolUse` há 12 s → `active: true`; há 13 s → `false` | Movimento: anel e card aceso | F1 |
| R31 | Aceso propaga ao pai | `workflow e sessão acendem quando um descendente agiu` | agente do workflow agiu há 5 s → agente, workflow e sessão `lit: true`; irmão `lit: false` | Movimento: "ele ou um descendente" | F1 |
| R32 | Mediana das chamadas | `mediana das chamadas` | tokens [10, 20, 90] → 20; [10, 20, 30, 40] → 25 | Painel: linha da mediana | F1 |
| R33 | Fora da curva: > 2× a mediana, com 3+ chamadas | `chamada acima do dobro da mediana fica fora da curva` | [10, 20, 41] → só 41 marcada; [10, 20, 40] → nenhuma (igual não é mais que) | Tokens: fora da curva | F1 |
| R34 | Menos de 3 chamadas não marca | `duas chamadas nunca ficam fora da curva` | [10, 100] → nenhuma | Tokens: só com 3+ | F1 |
| R35 | REPROVADO vem do resultado | (já existe; manter) | resultado "VEREDITO: REPROVADO …" → conta em `rejectedCount` com o trecho do motivo (tamanho do trecho: **pergunta**); "VEREDITO: APROVADO" e "nenhum REPROVADO encontrado" → não contam | Painel: REPROVADO; Tokens por agente | F1 |
| R36 | Total de reprovadas aparece uma vez | `total de reprovadas é calculado no grupo, não por chamada` | 3 chamadas, 2 REPROVADO → grupo `rejectedCount: 2`, chamadas sem total | Painel: "aparece uma vez só" | F1 |
| R37 | Faixa: entra REPROVADO | `faixa lista reprovação recente` | agente do dia com REPROVADO → item `{ kind: rejected, target: agentId }`; por quanto tempo fica: **pendente** (P5) | Faixa de atenção | F1 |
| R38 | Faixa: entra "sem nova ação há N min" (≥ 10 min) | `faixa lista agente sem nova ação há 10 min` | agente rodando, sem ação há 14 min, sem ferramenta em andamento → `"sem nova ação há 14 min"`; há 9 min → fora | Faixa; Respostas do dono 2 | F1 |
| R39 | Faixa: entra "sem sinal" | `faixa lista sessão sem sinal` | sessão `stale` hoje → item | Faixa de atenção | F1 |
| R40 | Faixa: entra "sua vez" só se recente | `faixa lista sua vez só até 30 min` | `Stop` há 3 min → `"terminou há 3 min"`; há 31 min → fora | Faixa; Estados: sua vez | F1 |
| R41 | Faixa: "aguardando você" no topo | `quem aguarda você vem primeiro na faixa` | 1 `waiting` + 1 REPROVADO → `waiting` primeiro | Estados: "sobe ao topo" | F1 |
| R42 | Faixa: não entram rodando, concluído, encerrada, abertas sem atividade | `faixa ignora o que não pede ação` | só sessões `running`/`ended` → `[]` | Faixa: "só fatos que pedem ação" | F1 |
| R43 | Faixa vazia diz "Tudo certo" | `sem fatos a faixa diz tudo certo` | `[]` → texto "Tudo certo: ninguém esperando você, nada reprovado ou parado." | Faixa: "Tudo certo" | F1 |
| R44 | Mostrador: agentes agindo | `mostrador conta agentes que agiram nos últimos 12 s` | 3 agentes rodando, ações há 12 s, 5 s e 13 s → 2 (mesmo limite ≤ 12 s do R30) | Mostrador | F1 |
| R45 | Mostrador: ações no último minuto | `mostrador conta ações do último minuto` | `PostToolUse` há 30 s, 59 s, 61 s → 2 | Mostrador | F1 |
| R46 | Mostrador: tokens de hoje | `mostrador soma tokens só de hoje` | igual a R18 somado em todas as sessões do dia | Mostrador; Dias | F1 |
| R47 | Workflow > 6 agentes esconde concluídos sem alerta | `workflow grande esconde concluídos sem alerta` | 8 agentes: 4 concluídos sem REPROVADO, 1 concluído REPROVADO, 3 rodando → visíveis 4, `hiddenDone: 4` ("4 concluídos · mostrar") | Cards | F1 |
| R48 | Workflow com até 6 mostra todos | `workflow com 6 agentes mostra todos` | 6 agentes, 5 concluídos → `hiddenDone: 0` | Cards | F1 |
| R49 | Ordem fixa pela hora de início | `ordem não muda quando o estado muda` | A (09:00), B (09:05); B passa a `waiting` → ordem continua A, B | Cards: ordem fixa | F1 |
| R50 | Aguardando você sobe só na faixa | `aguardando sobe na faixa sem reordenar o mapa` | mesmo caso do R49 → faixa com B primeiro, mapa A, B. **Pendente** (P4): se o dono quiser o card subindo, a regra muda | Estados × Cards | F1 |
| R51 | Encerradas hoje recolhidas | `sessões encerradas vão para o grupo recolhido` | 2 `ended` hoje → grupo `endedToday` com 2 | Cards: "Encerradas hoje (N)" | F1 |
| R52 | Branch no evento de início | `SessionStart envia a branch` (`send.test.js`) | entrada `SessionStart` com `cwd` em repo git na branch `feat/x` → payload com `branch: "feat/x"`; fora de git ou HEAD solto (sem branch) → `branch: null`, sem erro | Mudanças nos dados: branch | F2 |
| R53 | Branch da sessão no board | `sessão mostra a branch do início` | `SessionStart` com `branch` → `session.branch = "feat/x"` | Painel: pasta + branch | F2 |
| R54 | Consulta por dia monta o intervalo certo | `consulta do dia usa os limites locais` | dia ontem, fuso SP → filtros `gte 2026-11-11T03:00Z`, `lt 2026-11-12T03:00Z` | Mudanças nos dados: consulta por dia | F2 |
| R55 | Consulta do dia traz sessões abertas de antes | `consulta do dia inclui o histórico das sessões do dia` | sessão com evento hoje e início ontem → busca por `session_id` traz os eventos de ontem também | Dias: marcas, sessão inteira | F2 |
| R56 | Sem limite fixo de 5.000 | `consulta pagina até trazer tudo` | páginas de 1.000 + 1.000 + 500 → 3 chamadas, 2.500 eventos (para na página incompleta); erro na página 2 → a consulta falha com a mensagem do Supabase (leva ao T2), sem mostrar dados pela metade | Mudanças nos dados | F2 |
| R57 | Tokens da semana por dia (RPC) | `my_week_tokens soma por dia local sem dobrar` (teste SQL manual, ver riscos F2) | mesmo caso do R21 no banco | Dias: semana | F2 |
| R58 | Tempo relativo com horário exato | `tempo relativo` | 40 s → "agora" (**pergunta**: a spec não define abaixo de 1 min); 3 min → "há 3 min"; 2 h 10 → "há 2 h"; `title` = "12/11 14:32" | Texto | F1 |
| R59 | Verbo de ação no lugar da ferramenta | `ação vira verbo` | `Edit` + `docs/spec.md` → "editou spec.md"; `Bash` + "npm test" → "rodou npm test"; ferramenta desconhecida → nome como veio | Texto | F1 |
| R60 | Pasta pelo nome final | (já existe em app.js; mover para regra testada) | `/home/joao/agent-dashboard` → "agent-dashboard" | Texto | F1 |
| R61 | Sessão: "hoje: X · sessão inteira: Y" | `painel mostra tokens de hoje e da sessão inteira` | caso R18 → "hoje: 60 mil · sessão inteira: 160 mil" | Dias: marcas no painel | F1 |
| R62 | Formato curto de tokens | (já existe em `format.test.js`; manter) | 12400 → "12,4 mil"; 1200000 → "1,2 mi"; 999 → "999"; 999600 → "1 mi"; null → "—" | Tokens: formato curto | F1 |
| R63 | Número principal = entrada + saída, sem cache | (já existe; manter) | entrada 100, saída 50, cache 9.000 → principal 150; cache separado em criação e leitura | Tokens | F1 |
| R64 | Mesma resposta não conta duas vezes | (já existe em `send.test.js`; manter) | 2 linhas com o mesmo `message.id` → uso contado uma vez | Fatos dos dados: tokens | F1 |
| R65 | Agentes avulsos agrupados pelo tipo | (já existe; manter) | 3 `logic-reviewer` + 1 `Explore` → 2 grupos | Agrupar: avulsos | F1 |
| R66 | Rótulo curto deduzido da tarefa (agente de workflow) | `agente de workflow recebe rótulo da tarefa` | tarefa "Revise a lógica da fase 2 do plano…" → rótulo curto (regra de corte: **pergunta**, sugestão: primeiras 4 palavras sem verbo de comando); sem tarefa → "agente 3" | Agrupar: rótulo | F1 |
| R67 | Soma só com início idêntico e com a marca | (já existe; manter) | 2 tarefas com os mesmos 60 primeiros caracteres → 1 grupo, `probableSameAgent: true` ("provável mesmo agente"); 1 caractere diferente → 2 grupos | Agrupar: somar | F1 |
| R68 | % da sessão | (já existe; manter) | agente 30 mil, sessão (conversa + agentes) 120 mil → 25%; sessão 0 → sem % | Tokens por agente | F1 |
| R69 | Linha por agente | `resumo do agente` | 3 chamadas, 45 mil, 25%, 1 REPROVADO → "3 chamadas · total 45 mil · 25% da sessão · 1 reprovou" | Tokens: por agente | F1 |
| R70 | Workflow concluído | (já existe; manter) | `UserPromptSubmit` com o `runId` → `done` | Mapa: workflow concluído | F1 |
| R71 | Base do dia para sessão nova e para início fora dos 7 dias | `sessão nova hoje conta tudo; sem Stop anterior guardado o dia começa do zero` | 1º `Stop` hoje 40 mil, sem anterior → hoje 40 mil; sessão iniciada há 9 dias, 1º `Stop` guardado acumulado 500 mil → dia = só a diferença a partir do 2º `Stop`, com aviso "início não guardado" | Dias; P2 | F1 |
| R72 | Acumulado que cai (compactar ou limpar a conversa) | `queda do acumulado não gera tokens negativos` | `Stop` 160 mil → `Stop` 20 mil → `Stop` 35 mil → soma do dia 160 mil + 35 mil? (**pergunta**, sugestão: queda reinicia a base; nunca negativo) | P2 | F1 |
| R73 | Dia passado congela o relógio | `dia passado usa o fim do dia como agora` | vista de ontem, sessão com último evento 23:40 rodando → estado calculado com now = 23:59:59 de ontem, nunca "sem sinal" por causa de hoje; nada aceso | Dias: mapa congelado | F1 |
| R74 | Queda do painel congela o relógio | `com o painel desconectado o agora é a última atualização` | última atualização 14:32, now 14:50 → estados com now 14:32 (ninguém vira "sem sinal" pela queda do painel) | Estados: queda do painel | F1 |
| R75 | Faixa sem repetição | `sessão sem sinal não repete os agentes dela na faixa` | sessão `stale` com 2 agentes sem ação → 1 item (a sessão) | Faixa | F1 |
| R76 | Estado das linhas | `linha segue a atividade do filho` | filho agiu há ≤ 12 s → `flow`; rodando sem agir → `dashed`; parado/concluído → `idle` | Linhas | F1 |
| R77 | Sem identificadores técnicos à vista | `textos da tela não mostram ids` | agente sem tarefa nem tipo conhecido → "agente 2", nunca `agent_id`, `session_id` ou `wf_…` | Texto | F1 |
| R78 | Estado da interface (reducer puro): "Como ler" | `como ler abre só na primeira visita` | sem marca guardada → `helpOpen: true`; fechar → grava marca; com marca → `false` | Mostrador: "?" | F3 |
| R79 | Reducer: dia escolhido | `escolher dia passado congela; hoje volta ao vivo` | `selectDay(ontem)` → `{ day: ontem, live: false }`; `backToLive` → `{ day: hoje, live: true }`; botão âmbar → hoje + seleção da sessão | Dias | F3 |
| R80 | Reducer: seleção | `clicar na faixa seleciona o item` | `select(agentId)` → `selected: agentId`, painel aberto; `close` → nada selecionado | Faixa; Painel | F3 |
| R81 | Reducer: mostrador | `clicar em tokens abre os 7 dias; ? abre o como ler` | `openGauge('tokens')` → `gauge: tokens`; `openGauge('help')` → `gauge: help` | Mostrador | F3 |
| R82 | Reducer: expandir | `mostrar concluídos e abrir grupos recolhidos` | `expand(workflowId)` → `hiddenDone` some; `toggleGroup('endedToday')` → aberto | Cards | F3 |

## Matriz de testes — estados e interações das telas

Componentes como funções que devolvem HTML a partir de dados prontos (sem `fetch`, sem relógio). O teste chama a função e confere o texto e os atributos com `node:test`, sem jsdom. Clique, rolagem e linhas medidas na tela ficam para o navegador (coluna Fase = "navegador"). Texto marcado **pergunta** ainda não está definido na spec; vai uma sugestão.

| # | Componente | Estado ou ação | O que o usuário vê/faz | Critério | Fase |
|---|---|---|---|---|---|
| T1 | Tela inteira | carregando | Esqueleto do mapa com "Carregando suas sessões…" (**pergunta**) | Estados de conteúdo | F3 |
| T2 | Tela inteira | erro do Supabase | "Não foi possível carregar suas sessões: {mensagem do Supabase}. Confira a internet e clique em Tentar de novo." + botão "Tentar de novo" (**pergunta**) | Estados de conteúdo | F3 |
| T3 | Tela inteira | vazio, hoje | "Nenhuma sessão do Claude Code neste dia." + "Ainda não conectou? Clique em Conectar meu Claude Code no topo." | Protótipo | F3 |
| T4 | Tela inteira | vazio, dia passado | "Nenhuma sessão neste dia." | Protótipo | F3 |
| T5 | Tela inteira | preenchido | Faixa, mapa, mostrador e horário da última atualização | Direção visual | F3 |
| T6 | Tela inteira | sem login | "Entre com a sua conta do GitHub para ver o painel." + "Entrar com GitHub" | já existe | F3 |
| T7 | Tela inteira | sem acesso | "Seu usuário ainda não tem acesso. Peça para alguém do time incluir você." | já existe | F3 |
| T8 | Tela inteira | primeiro acesso | "Como ler" abre sozinho; ao fechar não volta. Regra no R78; abrir/fechar no navegador | Mostrador: "?" | F3 + navegador |
| T9 | Tela inteira | conexão do painel caída | Faixa própria: "Sem conexão desde 14:32. Os dados param nesse horário; reconecta sozinho." (**pergunta** no texto); nada vira "sem sinal" por isso (provado no R74; o aviso aparece no navegador) | Estados: queda de conexão do painel | F4 + navegador |
| T10 | Tela inteira | dia passado congelado | Faixa azul-acinzentada "Você está vendo {dia}. Nada aqui se mexe." + "Voltar ao vivo"; sem faíscas, giro e brilho (estado congelado provado no R73) | Dias: mapa congelado | F3 |
| T11 | Tela inteira | dia passado + alguém aguardando hoje | Botão âmbar no topo leva de volta a hoje; abrir a sessão junto é **pergunta** (spec diz só "leva de volta para hoje") | Dias: mapa congelado | F3 |
| T12 | Tela inteira | `prefers-reduced-motion` | Mesmos números, sem faíscas, giro e brilho | Movimento | navegador |
| T13 | Tela inteira | ≥ 1280 px | Mapa + painel fixo | Larguras | navegador |
| T14 | Tela inteira | 1100–1279 px | Painel por cima do mapa, botão fechar | Larguras | navegador |
| T15 | Tela inteira | meia tela/celular (< 1100 px) | Árvore vertical, nada cortado | Larguras | navegador |
| T16 | Cabeçalho | horário da última atualização | "Atualizado às 14:32:10" sempre visível | Estados | F3 |
| T17 | Seletor de dia | escolher Ontem | Mapa congelado de ontem; Hoje volta ao vivo. Regra no R79; clique no navegador | Dias | F3 + navegador |
| T18 | Seletor de dia | meia tela/celular (< 1100 px) | Seletor cabe ou vira menu | Larguras | navegador |
| T19 | Faixa de atenção | vazia | "Tudo certo: ninguém esperando você, nada reprovado ou parado." | Faixa | F3 |
| T20 | Faixa de atenção | preenchida | Um botão por fato, "aguardando você" primeiro e em âmbar; clicar seleciona e rola até o item. Seleção no R80; rolagem no navegador | Faixa | F3 + navegador |
| T21 | Faixa de atenção | meia tela/celular (< 1100 px) | Botões quebram linha sem cortar texto | Larguras | navegador |
| T22 | Mostrador | preenchido | "N agindo · N ações/min · X tokens hoje" | Mostrador | F3 |
| T23 | Mostrador | clicar em tokens | Últimos 7 dias em valor absoluto + divisão por sessão do dia. Abrir no R81 | Mostrador | F3 + navegador |
| T24 | Mostrador | "?" | Abre o "Como ler" com a definição de tokens. Abrir no R81 | Mostrador; Tokens | F3 + navegador |
| T25 | Mostrador | 7 dias carregando / erro / vazio | "Carregando…" / "Não foi possível carregar os últimos 7 dias: {mensagem}." / "Sem tokens nos últimos 7 dias." (**pergunta**) | Estados de conteúdo | F3 |
| T26 | Mostrador | meia tela/celular (< 1100 px) | Não cobre cards | Larguras | navegador |
| T27 | Card de sessão | cada um dos 6 estados | Palavra + ícone; âmbar só em "aguardando você" | Estados | F3 |
| T28 | Card de sessão | sua vez recente / antiga | "terminou há 3 min" com destaque leve / "sua vez desde 11:20" em cinza | Estados | F3 |
| T29 | Card de sessão | começou ontem / continua hoje / retomada | "← começou ontem às 22:40" / "continua hoje →" / "retomada às 09:12" | Dias | F3 |
| T30 | Card de sessão | nuvem | Ícone de nuvem (vem do protótipo; **pergunta**: a spec não define a marca de nuvem) | Respostas do dono 3 | F3 |
| T31 | Card de agente | rodando com ferramenta longa | "rodando há 6 min · rodou npm test" | Estados | F3 |
| T32 | Card de agente | sem nova ação | "sem nova ação há 14 min", destaque leve, não sobe | Estados | F3 |
| T33 | Card de agente | REPROVADO | Etiqueta violeta "REPROVADO" | Estados | F3 |
| T34 | Card de agente | aceso (≤ 12 s) | Anel girando e borda terracota | Movimento | F4 |
| T35 | Card de workflow | > 6 agentes | "N concluídos · mostrar"; clicar mostra todos. Expandir no R82 | Cards | F3 + navegador |
| T36 | Card (todos) | batimento | 20 barrinhas | Movimento | F3 |
| T37 | Grupos recolhidos | Encerradas hoje / Abertas, sem atividade hoje | "Encerradas hoje (N)" / "Abertas, sem atividade hoje (N)"; clicar abre. Abrir no R82 | Cards; Dias | F3 + navegador |
| T38 | Mapa | meia tela/celular (< 1100 px) | Árvore vertical com linhas em L | Larguras | navegador |
| T39 | Linhas | parada / rodando sem agir / agindo | Cinza / tracejada / terracota com fluxo. Estado no R76; desenho no navegador | Linhas | navegador |
| T40 | Faísca | `PostToolUse` novo | Faísca terracota até o agente; ao concluir, faísca verde volta ao pai | Movimento | navegador |
| T41 | Agente novo | `SubagentStart` | Entra deslizando, sem mover os outros | Movimento; ordem fixa | navegador |
| T42 | Painel de detalhe | nada selecionado | "Clique numa sessão ou num agente para ver o detalhe." (**pergunta**) | Painel | F3 |
| T43 | Painel de detalhe | aguardando permissão | 1º bloco: "Responda no terminal: {pasta} · {branch}"; na nuvem, "Abrir a sessão" | Painel 1 | F3 |
| T44 | Painel de detalhe | sem branch (dado não veio) | Só a pasta, sem rótulo vazio | Painel 1 | F3 |
| T45 | Painel de detalhe | Agora | Ritmo de 40 colunas + últimas ações com "há X" | Painel 2 | F3 |
| T46 | Painel de detalhe | sessão encerrada | Ritmo do início ao fim, legenda "sessão inteira (10:00–10:40)" | Painel 2 | F3 |
| T47 | Painel de detalhe | chamadas | Barras, linha da mediana, "fora da curva", REPROVADO com trecho; total de reprovadas uma vez | Painel 3 | F3 |
| T48 | Painel de detalhe | chamadas: 1 ou 2 | Barras sem marca "fora da curva" | Tokens | F3 |
| T49 | Painel de detalhe | tokens | Número grande, barra da fatia da sessão, exato (entrada + saída); cache recolhido com criação e leitura | Painel 4 | F3 |
| T50 | Painel de detalhe | tokens ainda não medidos (agente rodando) | "Tokens aparecem quando o agente termina." (**pergunta**) | Tokens | F3 |
| T51 | Painel de detalhe | tarefa | 3 linhas + "ler a tarefa inteira" | Painel 5 | F3 |
| T52 | Painel de detalhe | sessão/workflow | Filhos como barras clicáveis | Painel | F3 |
| T53 | Painel de detalhe | sessão de vários dias | "hoje: X · sessão inteira: Y" | Dias | F3 |
| T54 | Painel de detalhe | início com mais de 7 dias | "O início desta sessão tem mais de 7 dias e não está mais guardado." | Dias | F3 |
| T55 | Painel de detalhe | rolar | Cabeçalho fixo | Painel | navegador |
| T56 | Painel de detalhe | meia tela/celular (< 1100 px) | Abre por cima, fecha com botão (Esc: **pergunta**) | Larguras | navegador |
| T57 | Aba do navegador | aguardando / sua vez recente / nada | "(2) Painel de agentes" / ícone com ponto / título limpo | Estados; Respostas 5 | F4 |
| T58 | Conectar meu Claude Code | erro / sucesso / copiar | Mantém o que já existe | já existe | F3 |
| T59 | Ao vivo | evento novo | Tokens sobem no card, workflow, sessão e total do dia sem recarregar. **Pergunta** (P3): os do agente só existem quando ele termina | Movimento | F4 |
| T60 | Painel de detalhe | Agora sem ações | "Nenhuma ação nos últimos 10 min." (**pergunta**) | Painel 2 | F3 |
| T61 | Painel de detalhe | sem chamadas | "Nenhum agente chamado nesta sessão." (**pergunta**) | Painel 3 | F3 |
| T62 | Painel de detalhe | sem tarefa conhecida | Bloco Tarefa some (sem rótulo vazio) | Painel 5 | F3 |
| T63 | Mostrador | dia passado | Mostra "agindo" e "ações/min" como "—" e os tokens daquele dia (**pergunta**) | Mostrador; Dias | F3 |
| T64 | Card de agente avulso | no mapa | Um card por tipo com "N chamadas" (R65) | Agrupar | F3 |

## Plano por fase

**Protótipo:** `MapaR` (1.335 linhas: ~495 de HTML/CSS no formato de template do Claude Design e ~840 de JS numa classe `DCLogic`, com dados falsos de cenário). O runtime `DCLogic`/`dc-import` não existe fora do Claude Design, então nada roda como está. **Aproveitável:** cores (`C`), ícones SVG (`ic`), tabela de estados (`EST`), CSS e estrutura dos cards, os textos, e a medição das linhas (`_medir`, curvas e L) quase literal; a animação (`_passo`) como referência. **Não aproveitável:** os dados de cenário e a lógica de estado (inventada, não vem dos eventos). Estimativa: ~40% (visual e linhas); a lógica sai do `board.js`.

### F1 — Regras de estado, tempo e tokens por dia
- `web/board.js`: estados novos (`waiting`, `your_turn`, aceso, ordem por início, grupos), porque é onde o estado já é decidido.
- `web/day.js` (novo): dia local, limites, seletor e marcas de vários dias; separado porque é genérico de tempo e não sabe nada de agentes.
- `web/usage.js`: tokens por dia (diferença do `Stop` acumulado), mediana e fora da curva.
- `web/activity.js` (novo): batimento, ritmo, "agiu nos últimos 12 s", mostrador.
- `web/attention.js` (novo): fatos da faixa.
- `web/ui-state.js` (novo, testado na F3): reducer puro da interface (dia, seleção, mostrador, "Como ler", grupos abertos), porque sem jsdom é o jeito de provar as interações; o clique em si fica no navegador.
- `web/format.js`: título/ícone da aba, tempo relativo, verbos.
- `*.test.js` correspondentes. Linhas: R1–R51, R58–R77. Padrão visual: nenhum. **Riscos:** o `Stop` traz tokens acumulados da conversa (medido), então o dia precisa do último `Stop` anterior ao dia (exige R55) e de uma regra para quando o acumulado cai (R72); `idle_prompt`/`elicitation_dialog` hoje contam como aguardando (P1).

### F2 — Dados
- `supabase/migrations/003_v2_2.sql`: coluna `branch`, índice `(login, session_id, created_at)` e `my_week_tokens` por dia local (recebe o fuso). Porque a consulta muda de 24 h para dia + sessão.
- `supabase/schema.sql`: espelho da migration.
- `hook/send.sh` + `web/send.test.js`: `branch` no `SessionStart` (`git -C "$cwd" branch --show-current`).
- `web/queries.js` (novo): consulta do dia, das sessões do dia e paginação; recebe o cliente Supabase por parâmetro para testar com um falso.
- Linhas: R52–R57. **Riscos:** o `cwd` chega em todo evento, inclusive no de início (medido 12/11), então a branch sai do `git` na pasta; `my_week_tokens` sem teste automático (só conferência manual no SQL); a migration 002 ainda não rodou no Supabase.

### F3 — Componentes do mapa e do painel
- `web/views/` (novo): `header.js`, `attention-strip.js`, `gauge.js`, `session-card.js`, `workflow-card.js`, `agent-card.js`, `detail-panel.js`, `states.js` (carregando/erro/vazio), `icons.js`, cada um uma função que devolve HTML; porque `app.js` hoje mistura tudo.
- `web/styles.css` (novo): portado do protótipo. `web/index.html`: fonte Geist e o CSS.
- `web/views/*.test.js` e `web/ui-state.test.js`: R78–R82 e T1–T11, T16–T17, T19–T20, T22–T25, T27–T33, T35–T37, T42–T54, T58, T60–T64.
- Padrão visual: telas A–I do protótipo. **Riscos:** cards com altura livre e ordem fixa exigem chave estável por item; texto longo em inglês.

### F4 — Ligação ao vivo, movimento e larguras
- `web/app.js`: só orquestra (login, consulta, canal ao vivo, relógio de 1 s para "aceso"/faíscas, render).
- `web/live.js` (novo): faíscas, anel e linhas medidas (`_medir` do protótipo), larguras e `prefers-reduced-motion`.
- Linhas: T9, T34, T57, T59 e todas as "navegador". **Riscos:** render completo a cada evento quebra a animação (precisa atualizar só o card); desempenho com muitos eventos; reconexão ao virar o dia.

## Suposições e perguntas
Decidido pelo coordenador: **sem jsdom**; interação vira reducer puro testado (R78–R82) + navegador.

Perguntas ao dono:
- **P1.** "Aguardando você" só com `permission_prompt`? Hoje `idle_prompt`, `elicitation_dialog` e `agent_needs_input` também contam. Sugestão: `elicitation_dialog` também conta; `idle_prompt` não.
- **P2.** Tokens do dia da conversa = último `Stop` do dia − último `Stop` anterior (o acumulado é medido). Quando o acumulado cai (compactar/limpar), sugestão: a queda reinicia a base, nunca negativo (R72).
- **P3.** "Tokens sobem ao vivo" × tokens do agente só existirem no `SubagentStop` (medido). Aceitar que o card do agente só ganha tokens ao terminar, e que sessão/dia sobem a cada `Stop`?
- **P4.** "Sobe ao topo": só na faixa (mapa com ordem fixa) ou o card também sobe? Sugestão: só na faixa.
- **P5.** REPROVADO fica na faixa até quando? Sugestão: até o dev abrir o item, ou até o fim do dia.
- **P6.** Textos marcados **pergunta** nas matrizes (carregando, erros, vazios, conexão caída, "agora", "começou há 3 dias", tamanho do trecho do motivo, rótulo do agente, nuvem, Esc, botão âmbar abrindo a sessão).
- **P7.** Batimento e ritmo de um card incluem as ações dos descendentes? Sugestão: sim.

Medido em 12/11: todo evento traz `cwd`, inclusive o de início; `--continue`/`--resume` mantêm o `session_id` e o `SessionStart` traz `source: "resume"`; `PreToolUse`/`PostToolUse` de subagente trazem `agent_id` e `agent_type`; tokens do agente só no `SubagentStop`, os da conversa a cada `Stop` (acumulado).

Seguem supostos: formato real do `Notification`; identificador da sessão na nuvem para "Abrir a sessão".

## Andamento
- 12/11/2026: base da v1 em `0664126` (main, sem push) e publicada; `002_v1.sql` rodado. Branch `feat/mapa-vivo-v2-2`.
- Spec aprovada (`c335f45`). Stack trocada para Vite + React + TS (pedido do dono).
- **F1 aprovada** em 4 rodadas (bateria + lógica): `a1a7795` regras; `b5b8023` correções r1; `29f5acd` conversão Vite/React/TS; `7667567` saída do aguardando/sua vez; `90dda2f` aviso sem agente ignora a ferramenta Agent. 140 testes.
- Pendente com o dono: resultado da consulta dos avisos `Notification` (saber se trazem `agent_id`).
- **F2 aprovada** em 2 rodadas: `b9f540a` consultas/hook/migration 003; `543ec02` sessões abertas e evento ao vivo de sessão desconhecida + PermissionRequest como fonte de "aguardando"; `6507a4a` menores. 187 testes.
- Pendente com o dono: rodar `003_v2_2.sql` e `tests/003_week_tokens.sql`; conferir `max-rows` = 1000 no Supabase.
- **F3 aprovada** em 3 rodadas: `f699402` telas; `d03e671` Conectar sem gerar chave, carga sem depender do canal, origem no hook; `7e76d5c` Conectado só com evento após a chave. 373 testes.
- `005_estado_da_conexao.sql` rodado pelo dono.
- **F4 aprovada** em 2 rodadas: `5c60f85` movimento/larguras/aba; `fecd487` faísca em CSS numa camada própria; `daa0e8b` timers e memoização. 394 testes. Revisão r2 aprovada no chat (gravação do arquivo negada pelo sistema). Menor aberto: buildBoard ~53 ms/s em dia pesado pode engasgar a faísca.
- Próximo: fechamento (boas práticas, critérios, navegador, publicação com OK).
