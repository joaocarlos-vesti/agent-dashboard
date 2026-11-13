REVISÃO DE LÓGICA — Painel de agentes F3 @ d03e671 · rodada 2

Escopo: f699402..d03e671. `npm test` passa (371/371, 20 arquivos), `tsc --noEmit` está limpo e o `vite build` termina sem erro. O `dist/` que ele gera é ignorado pelo git.

Achados da rodada 1
1. BLOQUEANTE (Conectar): corrigido.
   - A tela só consulta `my_connection_status` ao abrir.
   - A chave nova só sai do clique: o `useConnectPanel.advance` dispara a geração quando o reducer passa para "generating". Nenhum efeito gera chave, então o modo estrito não duplica nada, e o `isGenerating` impede a dupla geração por clique duplo.
   - Com chave existente, há confirmação ("Desligar a atual e gerar nova"). O reducer ignora uma resposta atrasada.
   - Migration 005: `security definer` com `search_path` fixo; `is_member()` e `my_login()`; sem execução para public e anon, com grant para authenticated. Só o próprio login, seguro.
2. IMPORTANTE (carga sem o canal ao vivo): corrigido. useDashboard.ts:95 carrega logo que `isMember` é true e recarrega no `SUBSCRIBED`, e o `latestLoad` descarta a resposta mais antiga. Com o canal em erro, o aviso "Sem conexão" (T9) aparece e os dados ficam na tela.
3–5. MENORES: corrigidos.
   - O texto do início não guardado agora é neutro.
   - A última resposta no dia passado vai só até o "agora" da vista, com teste.
   - O plural de "ação/ações" está certo.

Outros pontos conferidos
- SessionStart com origem: há teste com o payload medido em 12/11. O `summary` nulo da medição vinha do send.sh antigo instalado na máquina; resolve com o deploy e reinstalando.
- "Clique seleciona, seta expande": o card agora tem dois botões irmãos (sem botão dentro de botão). O clique no corpo só seleciona, e a seta só abre ou fecha.

Achados novos
N1. [IMPORTANTE] src/eventSource.ts:23-31 e src/lib/connect-flow.ts:70-75 (`overviewOf`). O "Conectado" usa o último evento do login sem comparar com a data da chave atual. A RPC devolve `key_created_at`, mas o cliente descarta. Entrada: o dono gera uma chave nova às 10:00 sem reinstalar o hook, e o último evento é das 09:58, enviado com a chave antiga e já desligada. Resultado: "Conectado · último evento há N min", quando nada mais chega. É o mesmo cenário em que o dono perdeu a conexão, agora escondido.
   Corrigir em: `fetchConnectionStatus` e `overviewOf`. Levar `keyCreatedAt` no `ConnectionStatus` e só dizer "Conectado" quando `lastEventAt > keyCreatedAt`. Senão, "Ainda não conectado" com a dica de rodar o comando. Teste com o caso acima.
N2. [MENOR] useDashboard.ts. Se o canal ao vivo nunca responder (fica tentando conectar, sem erro), `isLive` continua true e o cabeçalho diz "Ao vivo". É raro.

VEREDITO: REPROVADO
