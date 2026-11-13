REVISÃO DE LÓGICA — Painel de agentes F3 @ 7e76d5c · rodada 3

Escopo: d03e671..7e76d5c. Rodei `npm test` (373/373) e `tsc --noEmit` (limpo).

Achados da rodada 2
- N1: corrigido.
  - Mudança: `ConnectionStatus` passou a levar `keyCreatedAt`, e `hasEventSinceKey` exige que o último evento seja posterior à chave atual.
  - Testes: chave às 10:00 com evento às 09:58 dá "Ainda não conectado"; evento às 10:01 dá "Conectado"; chave sem nenhum evento mostra o horário da chave. As duas datas vêm do servidor, então o relógio do navegador não interfere.
  - Texto: a tela não mostra o comando de propósito, porque a RPC não devolve a chave. Aceito; o texto aponta as duas saídas ("Rode … o comando que apareceu ao gerar, ou gere uma nova conexão").
- N2: corrigido. Um prazo de 10 s desliga o "Ao vivo" se o canal não conectar. O `SUBSCRIBED` cancela o prazo e o desmontar também. Um `SUBSCRIBED` depois do prazo religa o "Ao vivo" pelo callback.

Achados novos
M1. [MENOR] src/lib/connect-flow.ts, `keyWithoutEventHint`. O texto mostra só a hora (`slice(-5)`). Uma chave gerada ontem aparece como "gerada às 10:00". Usar dia e hora (`exactTime` inteiro) quando a chave não é de hoje.
M2. [MENOR] src/lib/connect-flow.ts, `hasEventSinceKey`. Com `keyCreatedAt` nulo (sem chave), o último evento conta como conexão, e a tela diz "Conectado" com `hasKey` falso. Hoje esse caso não ocorre, porque a chave só some junto com o acesso. Exigir `hasKey`.

Vizinhança: a confirmação e a geração não mudaram; a carga sem o canal continua igual.

VEREDITO: APROVADO
