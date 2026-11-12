# Painel de agentes — spec da v1

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

- "Aguardando você" sem nenhum evento por 2 h vira "sua vez".
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

### A confirmar
- O formato exato do aviso de permissão (`Notification`) no primeiro uso real.
- `--continue` no terminal interativo (testado só com `claude -p`).
- Pasta e branch disponíveis no evento de início.
- O identificador da sessão na nuvem, para o link "Abrir a sessão".

## Respostas do dono (12/11/2026)
1. **Aviso fora da aba:** só o título e o ícone da aba. Sem notificação do sistema.
2. **Sem nova ação:** destacar depois de **10 min**.
3. **Nuvem:** entra na v1 com o mesmo detalhe das sessões locais, inclusive tokens.
4. **O que conta no limite do plano:** em aberto, para a v2. Forma de conferir: anotar o `/usage` antes e depois de uma sessão cujos tokens o painel mediu.
5. **Título da aba:** conta só as sessões em "aguardando você" (pedido de permissão).
