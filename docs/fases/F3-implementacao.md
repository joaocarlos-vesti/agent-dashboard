# F3 — telas (mapa, cards, painel de detalhe, mostrador)

Branch `feat/mapa-vivo-v2-2`. Base da fase: `19d53f8`.

## O que entrou

Camada pura (src/lib), toda com teste escrito antes:

| Arquivo | O que decide | Testes | Vermelho antes de implementar |
| --- | --- | --- | --- |
| `ui-state.ts` | reducer: dia, seleção, mostrador, "Como ler", grupos, expandir, recolher, tarefa (R78-R82) | 26 | 19 de 26 |
| `map-tree.ts` | árvore sessão > workflow > agente, itens visíveis, caminho para revelar um nó | 18 | 15 de 18 |
| `card-model.ts` | texto, estado, tom, etiquetas, batimento (20 barras) e se ele aparece (T27-T33, T36, T64) | 25 | 23 de 24 + 1 de 1 (batimento) |
| `map-layout.ts` | posições, curvas e estado de cada linha (horizontal e vertical) | 17 | 17 de 17 |
| `map-scene.ts` | cena = itens + cards + linhas | 6 | 5 de 6 |
| `detail-model.ts` | blocos do painel de detalhe (T42-T54, T60-T62) | 39 | 30 de 39 |
| `screen-state.ts` | carregando, erro, vazio, sem login, sem acesso, pronto (T1-T7) | 10 | 8 de 10 |
| `gauge-model.ts` | 3 números, 7 dias, por sessão (T22-T25, T63) | 9 | 8 de 9 |
| `strip-model.ts` | faixa de atenção (T19) | 5 | 4 de 5 |
| `header-model.ts` | horário, dias, faixa de dia congelado, botão âmbar (T10, T11, T16) | 10 | 8 de 10 |
| `layout-mode.ts` | horizontal/vertical e painel fixo/por cima | 3 | 2 de 3 |

Total da suíte: 355 testes verdes (eram 187 antes da F3).

Casos que passaram "no vermelho" por serem negativos (só ficam vermelhos depois de a regra errada existir): ui-state (escape sem nada aberto), map-tree (sem workflow), card-model (default), map-layout, detail-model (sem bloco quando não há dado), screen-state, gauge-model, strip-model (dia passado), header-model, layout-mode, map-scene.

Camada de tela (sem teste de componente, conforme a decisão de não usar jsdom):

- `hooks/useUiState.ts` (reducer + localStorage do "Como ler" + Esc), `useWeekTokens.ts`, `useViewportMode.ts`, `useTodayKey.ts`, `useDashboardView.ts` (junta dados, modelos e ações; é o único que conhece tudo).
- `components/map/`: `MapView` (React Flow: nós card/grupo/"mais", aresta `tree`, pan por scroll, pontos de fundo, foco via `setCenter` quando `focusNonce` muda), `MapNodes` (cada nó mede a própria altura e devolve ao layout puro), `MapCard`, `HeartbeatBars`, `TreeEdge`.
- `components/chrome/`: `Header`, `DaySelector`, `FrozenBanner`, `AttentionStrip`, `ScreenMessage`.
- `components/gauge/`: `Gauge`, `WeekTokensPanel`, `HelpPanel`.
- `components/detail/`: `DetailPanel` + uma seção por arquivo (permissão, última resposta, atividade, chamadas, filhos, tokens, tarefa).
- `components/Icon.tsx` (Font Awesome free por `IconKey`), `styles/` (base, chrome, map, gauge, detail), `App.tsx` só compõe.
- Removidos: `BoardView.tsx`, `styles.css`. `ConnectPanel` mantido (T58).

## Aproveitado do protótipo

Cores e variáveis (fundo, painéis, âmbar, violeta, terracota), tabela de estados (palavra + ícone + cor), estilos de card por tom e de orbe por estado, etiquetas, larguras de coluna (224/232/256) e espaçamentos, geometria da curva (55%) e do L, estilos de linha (fluxo, tracejada, parada, pontilhada, encerrada, "mais"), cabeçalho, faixa de dia congelado, chips da faixa, mostrador flutuante com os dois painéis, ordem das seções do painel de detalhe, textos de interface. A lógica do protótipo (dados, estados) não foi usada: tudo vem de `src/lib`.

## Verificações

- `npm test`: 19 arquivos, 355 testes verdes.
- `npx tsc --noEmit`: sem erros.
- `npx vite build`: build ok.
- Sem lint nem Prettier configurados no projeto.
- Conferência no navegador (Chrome sem cabeça, página de teste com eventos montados à mão, apagada depois): 1440 px (painel fixo, mostrador com 7 dias, seleção, botão âmbar, faixa), 900 px (árvore vertical, painel por cima, "Como ler"), 420 px (painel por cima). Sem erro no console. Não foi testado contra o Supabase real (precisa de login).

## Decisões que a spec não trazia

- `useDashboard(viewedDay)` mantém sempre os eventos de hoje carregados; assim o botão âmbar (T11) funciona olhando outro dia. O evento ao vivo sempre entra em hoje.
- `useTodayKey` entrega o "hoje" ao reducer sem depender de `useDashboard` (evita dependência circular dia visto <-> dados).
- Linha de workflow/sessão fica "fluindo" quando algum descendente está aceso.
- Faixa de atenção esconde "aguardando" e "sua vez" em dia passado (mantém reprovado, sem ação e sem sinal).
- Antes da primeira carga o horário diz "Aguardando a primeira atualização".
- Erro de carga com sessões já na tela não derruba o mapa.
- Barrinhas do card só aparecem em agente ou sessão sem filhos, quando roda ou agiu nos últimos 10 min (regra do protótipo; teste novo no card-model).
- "Recolher tudo" fica numa barra acima do mapa, só no modo horizontal (no protótipo está no cabeçalho).
- A marca "Powered by React Flow" ficou visível (não escondi a atribuição).
- "Como ler o mapa" lista só o que existe na F3 (estados e barrinhas); faísca e anel girando entram com a F4.

## Ficou de fora (F4)

Faíscas e pulsos, anel girando, animações de entrada/conclusão, relógio de 1 s, ligação do movimento ao vivo, larguras responsivas finas (cabeçalho em 420 px quebra em 3 linhas), T9, T34, T57, T59. Pontos de encaixe: `data-lit` no card, classes `orb--*`, `heartbeat__bar--lit`, `focusNonce`.

## Perguntas em aberto (não bloqueiam)

1. T30: a spec não define a marca de nuvem. O ícone existe, mas `cloudSessionIds` está vazio porque o dado não chega do hook; hoje toda sessão aparece como terminal.
2. Texto "1 ações em 10 min" no painel (singular errado) vem de `detail-model` (`totalLabel`); corrigir junto com a F4 se o dono concordar com a redação.
3. Botões "A mesma sessão continua hoje" / "Ver o que veio antes" do protótipo (T29) não entraram no painel: a spec não os pede e o modelo do painel não os traz.

## Rodada 2

Revisão: `docs/fases/revisoes/` (r1 da F3). Verificações: `npm test` 20 arquivos, 371 testes verdes; `npx tsc --noEmit` limpo; `npx vite build` ok.

| Achado | O que foi feito |
|---|---|
| BLOQUEANTE: Conectar gerava chave ao abrir (T58) | A tela só consulta o estado, pela RPC nova `my_connection_status()` (`supabase/migrations/005_estado_da_conexao.sql`, também em `schema.sql`). Chave nova só por botão, com confirmação quando já há conexão; depois mostra o comando. A geração sai de um clique com trava (`isGenerating`), nunca de efeito, então o modo estrito do React não gera duas vezes. Regra em `src/lib/connect-flow.ts` (13 testes, vermelho visto antes), hook em `useConnectPanel.ts`. T58 coberto por `connect-flow.test.ts`. |
| IMPORTANTE: carga de hoje dependia do canal ao vivo | `useDashboard` carrega hoje sem esperar o canal; `SUBSCRIBED` recarrega; erro de canal mantém o aviso de conexão (T9) sem bloquear. |
| MENOR: texto de início ausente | Texto neutro (`START_MISSING_TEXT`). |
| MENOR: última resposta | `lastReplyOf` filtra até `now`. |
| MENOR: "1 ações" | Singular "1 ação" (teste novo). |
| SessionStart com resumo nulo | Causa: `~/.agent-dashboard/send.sh` instalado está antigo; o `hook/send.sh` do repositório já grava a origem. Teste de regressão com o payload real em `hook/send.test.ts` (passou sem vermelho, por isso). Ação do dono: deploy e rodar o comando de conexão de novo. |
| Decisão da condução: clicar no card seleciona e abre o detalhe; expandir só pela seta | `MapCard` separado em botão de seleção e botão de seta próprio (`aria-expanded`, mostra a contagem); `activateCard` só seleciona, `toggleCard` abre/fecha. Sem teste: é ligação de tela. |
| Spec | "Medido em 12/11/2026" ganhou a causa do `summary` nulo e a regra da tela Conectar. |

Ações do dono: rodar `supabase/migrations/005_estado_da_conexao.sql`; fazer o deploy; rodar o comando de conexão de novo em cada máquina.

## Rodada 3

| Achado | O que foi feito |
|---|---|
| N1 IMPORTANTE: "Conectado" ignorava a data da chave | `ConnectionStatus` leva `keyCreatedAt` (a RPC já devolvia; a migração 005 não mudou). "Conectado" só com `lastEventAt` posterior à chave; senão "Ainda não conectado" com "Conexão gerada às HH:MM — ainda não chegou nenhum evento…". Teste vermelho primeiro, com o caso chave 10:00 e evento 09:58. Diferença para o pedido: o comando não aparece, porque a chave só existe na tela no momento em que é gerada (a RPC não a devolve); o texto manda rodar o comando que apareceu ao gerar ou gerar uma nova conexão. |
| N2 MENOR: canal que nunca responde mantinha "Ao vivo" | Sem `SUBSCRIBED` em 10 s, `isLive` vira falso; o timer é limpo ao assinar e ao sair. Sem teste (efeito de tela). |
