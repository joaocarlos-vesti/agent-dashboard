REVISÃO DE LÓGICA — Painel de agentes F3 @ f699402 · rodada 1

Escopo: 19d53f8..f699402. Rodei `npm test` (355/355, 19 arquivos) e `tsc --noEmit` (limpo).

Critérios da fase (R78–R82 e as telas T da F3)
- R78–R82 (ui-state.ts): atendidos.
  - O "Como ler" abre só na primeira visita.
  - `selectDay` congela; `backToLive` e `goToWaiting` voltam para hoje.
  - `select` abre o caminho até o item e pede foco.
  - O mostrador alterna os painéis; Esc fecha o mostrador antes do painel.
  - `expand`, `toggleGroup` e `collapseAll` funcionam.
- T1–T7 (screen-state.ts): atendidos na regra. O erro mostra a mensagem real e tem "Tentar de novo"; vazio de hoje e vazio de dia passado usam os textos da matriz. Mas o carregamento pode não terminar nunca: ver achado 2.
- Dia passado: atendido.
  - O board usa o fim do dia como "agora", com `lit` sempre false.
  - O mostrador mostra "—" no que é ao vivo.
  - A faixa esconde "aguardando" e "sua vez".
  - O botão âmbar vem do board de hoje, mantido sempre carregado.
  - O título da aba vem só das sessões do mapa de hoje.
- Ordem fixa: atendida. As sessões vão pela hora de início, e os grupos avulsos pela primeira chamada, não pelos tokens.
- Regras do src/lib: os estados, o aceso, os tokens do dia, a faixa, o `hiddenDone` e os rótulos vêm do board. O que a tela compõe é só apresentação: o estado do card de workflow derivado do status dele e da sessão, e a soma de tokens dos agentes.
- Identificadores técnicos: nenhum à vista. Os ids aparecem só em `key` e em `id` de HTML.
- Lógica fora da UI: atendida. Só `MapView` e `MapNodes` guardam estado, e é estado de desenho (alturas e largura).

Achados
1. [BLOQUEANTE] src/ConnectPanel.tsx:14-19. Abrir a tela chama `create_my_key`, que apaga a chave anterior (schema.sql:50) e desliga o hook já instalado no terminal e na nuvem. Entrada: clicar em "Conectar meu Claude Code" só para ver as instruções. Resultado: o Claude Code conectado para de enviar eventos sem nenhum aviso, que foi o que aconteceu com o dono. Em desenvolvimento, o `StrictMode` (main.tsx:8) roda o efeito duas vezes: gera duas chaves, e a tela pode mostrar justamente a que já foi apagada.
   Corrigir em: ConnectPanel mais uma RPC nova.
   - Ao abrir, a tela só consulta o estado da conexão, com uma RPC `my_key_status()` (security definer, só o próprio login) que devolve se existe chave, quando foi criada e o último evento recebido. Ela mostra "Conectado · último evento há X" e o comando de instalação, sem gerar chave.
   - Para o comando, é preciso a chave atual: uma RPC `my_key()` só do próprio login, ou guardar a chave no navegador.
   - Chave nova só pelo botão "Gerar nova conexão", com confirmação: "Isso desliga o Claude Code já conectado (terminal e nuvem). Você vai precisar rodar o comando de novo."
   - Testar a regra de estado da tela em função pura.
2. [IMPORTANTE] src/useDashboard.ts:96-99. A carga de hoje só dispara quando o canal ao vivo chega a `SUBSCRIBED`. Entrada: websocket bloqueado (proxy ou rede), com o canal em `CHANNEL_ERROR` ou `TIMED_OUT`. Resultado: o `isLoadingDay` não termina e a tela fica em "Carregando suas sessões…" para sempre, sem mensagem e sem botão (o T1 e o T2 dependem disso). O defeito já existia antes da F3, mas é exatamente o estado de conteúdo desta fase.
   Corrigir em: `useDashboard`. Carregar o dia independente do canal (logo que `isMember` for true) e recarregar no `SUBSCRIBED`. Com o canal com erro, manter os dados e mostrar o aviso "Sem conexão" que já existe.
3. [MENOR] src/lib/detail-model.ts:67. O texto fixo "O início desta sessão tem mais de 7 dias…" afirma uma causa que pode ser falsa. Desde a F1 r2, `startMissing` também vale para hook instalado no meio da sessão e para retomada. Usar o `startMissingNotice` do board ou um texto neutro.
4. [MENOR] src/lib/detail-model.ts:141-145. No dia passado, `lastReplyOf` pega o último Stop entre todos os eventos carregados, inclusive os de dias seguintes. Filtrar até o "agora" da vista.
5. [MENOR] src/lib/detail-model.ts:124. "1 ações em 10 min": o plural está errado (o relatório já aponta).

Conferido sem achado: header-model (botão âmbar pela espera mais antiga e com o caminho até ela); strip-model (só itens com card de destino); gauge-model (semana com carregando, erro, vazio e preenchido; "—" no dia passado); map-tree (grupos e caminho até o item); useDashboard (descarta resposta antiga do dia passado, `retry` refaz as duas cargas); dia visto que a carga deixou de lado.

Perguntas de produto: clicar num card que tem filhos recolhe ou abre os filhos e também seleciona o card. Para quem só quer ver o detalhe, um clique recolhe a árvore. É o comportamento desejado?

VEREDITO: REPROVADO
