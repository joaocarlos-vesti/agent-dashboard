# F4 — Movimento ao vivo e larguras

## O que entrou

| Item da spec | Como |
|---|---|
| Faísca por ação (`PostToolUse`) | `lib/motion.ts` `sparksByEdge` decide em que linhas cada evento ao vivo corre (da sessão ao agente, uma linha depois da outra); `TreeEdge` desenha a bolinha com `animateMotion` pelo mesmo caminho da linha. Ação da conversa principal não tem linha: só acende o card. |
| Faísca verde ao concluir | `SubagentStop` vira faísca `done` que volta do agente para quem o chamou (mesmo mapa de linhas, sentido invertido). |
| Anel girando (agiu <= 12 s) | `card.ringing` (agente, ou sessão sem filhos); CSS `orb--ringing`. Workflow e sessão com filhos só acendem. |
| Card aceso propagando ao pai | Já vinha de `lit` (F1/F3); agora acende e apaga no tempo certo por causa do relógio de 1 s. |
| Agente novo entrando | `card.entering` (início há <= 4 s) + animação `card-enter`. |
| Tokens subindo ao vivo | Os números já vêm dos eventos; `LiveNumber` pisca quando o valor muda (card e mostrador). |
| Pulso âmbar só em "aguardando você" | CSS em `orb--waiting` e `map-card--waiting`; nenhum outro estado pulsa. |
| `prefers-reduced-motion` | Sem faíscas (não são criadas), sem giro, sem pulso, sem brilho; os mesmos números. |
| Relógio | `liveClockMs`: 1 s enquanto há ação recente, 30 s parado. Evento ao vivo também avança o `now` (antes a ação nova parecia do futuro e não acendia). |
| T9 | Faixa "Sem conexão desde HH:MM. Os dados param nesse horário; reconecta sozinho." (`offlineBannerText`). |
| T57 | Título com número e ícone da aba com ponto (`faviconHref`, `useTabIndicator`). |
| Larguras | Regra já vinha da F3 (`layout-mode`); conferida no DOM (abaixo). |
| M1/M2 (revisão F3 r3) | Texto da chave com dia quando não é de hoje; "Conectado" exige chave (`hasKey`). Testes vermelhos antes. |

## Arquivos

Novos: `src/lib/motion.ts` (+test), `src/hooks/useLiveSparks.ts`, `usePrefersReducedMotion.ts`, `useTabIndicator.ts`, `src/components/LiveNumber.tsx`.
Alterados: `card-model`, `format`, `header-model`, `connect-flow` (+ testes), `useDashboard`, `useDashboardView`, `App`, `MapView`, `MapCard`, `TreeEdge`, `Gauge`, `base.css`, `map.css`.

## Verificações

- `npm test`: 21 arquivos, 394 testes verdes (vermelho visto antes em connect-flow, motion, card-model, header-model e format).
- `npx tsc --noEmit`: limpo. `npx vite build`: ok.
- Sem lint nem Prettier no projeto.

## Conferência no navegador (Chrome sem cabeça, só pelo DOM; página de teste com Supabase falso, apagada)

- 1440 px: mapa 1080 + painel fixo 360, sem rolagem horizontal. 1200 px: painel por cima (absoluto, 400 px) com botão fechar. 720 px: árvore vertical (cards 688/644/600 de largura), painel por cima, sem rolagem horizontal. Nenhum card fora da tela.
- Evento ao vivo `PostToolUse` de agente: 2 faíscas (uma por linha, a segunda com 350 ms de atraso), anel no agente, card, workflow e sessão acesos; faíscas somem em 3 s; tudo apaga 12 s depois.
- `SubagentStop`: 2 faíscas verdes. `SubagentStart`: card novo com `entering`. `Stop` com tokens: total do dia passa de 136 mil para 187 mil e o número pisca.
- Canal em erro: faixa com o horário e "Ao vivo" some; ao reconectar a faixa sai. Título "(1) Painel de agentes" com um pedido pendente.
- Movimento reduzido: 0 faíscas, `animation: none` no anel e no pulso, sem sombra de brilho.
- Console sem erros. Não foi olhado visualmente (decisão do coordenador): a conferência visual fica para o teste do fechamento.

## Decisões que a spec não trazia

- Ação da conversa principal não gera faísca (sem linha de entrada); o anel e o card aceso mostram.
- Sem faísca em dia passado.
- Ícone da aba desenhado em SVG embutido (terminal terracota; ponto branco quando há "sua vez" recente).
- Não há contagem animada de tokens: só o destaque por 0,9 s (P3 continua valendo: o card do agente só ganha tokens ao terminar).

## Ficou de fora

- Cabeçalho em 420 px (3 linhas): não tratado, fora das medidas de projeto (1440 e 720).
- Conferência visual (cores, ritmo das animações) e reconexão ao virar o dia no navegador real.

## Rodada 2

| Achado | O que foi feito |
|---|---|
| BLOQUEANTE: faísca SMIL parada em linha montada há mais de 1 s | Troquei `animateMotion` por CSS (`offset-path` + `@keyframes spark-run`, `animation-delay` escalona as linhas, `animation-direction: reverse` na volta). Medi também que as linhas do React Flow são recriadas a cada batida do relógio (o `<g>` da linha troca a cada segundo), o que reiniciava a faísca mesmo em CSS; por isso as faíscas saíram das linhas e vão numa camada própria (`SparkLayer`, `ViewportPortal`), que não é recriada. |
| MENOR: painel recalculado inteiro a cada 1 s | `detail` e `gauge` em `useMemo` (só refazem quando o relógio, os eventos ou a seleção mudam). O que depende de `now` (cards, cena, faixa) continua refeito a cada batida: os textos de tempo mudam com ela. |
| MENOR: `setTimeout` do `useLiveSparks` não era cancelado | Os timers ficam num conjunto e são cancelados ao desmontar. |

Prova no DOM (Chrome sem cabeça, página de teste com Supabase falso, apagada), com as linhas montadas há mais de 4 s: a faísca nova tem `getAnimations()` com `playState: running` e `currentTime` ~30 ms ao nascer, avança 100 ms a cada 100 ms, o círculo se move pela linha (x de 247 a 293 na primeira linha), termina em 1250 ms (900 ms + 350 ms de atraso) e fica no mesmo elemento durante todo o percurso. A faísca verde percorre as linhas de volta (do agente para a sessão). Antes da correção, o elemento era recriado a cada ~1 s e o tempo voltava a ~50 ms.
Verificações: `npm test` 394 verdes, `npx tsc --noEmit` limpo, `npx vite build` ok.

## Rodada 3 (menores da revisão F4 r1)

| Achado | O que foi feito |
|---|---|
| MENOR 1: timer de limpeza das faíscas não cancelado ao desmontar | `useLiveSparks` guarda os timers e cancela todos ao desmontar (correção feita fora de mim; revisada e mantida). |
| MENOR 2: painel recalculado a cada segundo | `header`, `gauge` e `detail` agora em `useMemo` (antes recalculavam em qualquer renderização, inclusive a das faíscas); `liveClockMs` lê os eventos do fim para o começo e para no primeiro antigo (antes varria o dia inteiro a cada batida). Medido com um dia pesado (12 sessões, 4.812 eventos): `buildBoard` 53 ms, `buildMapScene` 1,4 ms, faixa 1,3 ms, mostrador 2,5 ms por batida. O relógio só bate a cada 1 s enquanto há ação nos últimos 13 s; parado, a cada 30 s. O custo que sobra é o `buildBoard` (depende do relógio: brilho, "sem sinal", "sua vez" recente); deixar incremental por sessão fica como melhoria futura, sem necessidade com dias menores. |

## Reforço dos critérios (verificador, criterios-r1)

| Achado | O que foi feito |
|---|---|
| R42 | Teste: sessão aberta e sem sinal de ontem, e "sua vez" recente na virada do dia, ficam fora da faixa. |
| T58 | Primeira conexão (sem chave anterior) mostra "Rode o comando abaixo para conectar o Claude Code."; "A conexão anterior foi desligada" só quando havia chave. |
| R73/T10 | Teste: dia passado com o painel conectado não acende sessão nem agente (com o controle ao vivo acendendo). Faíscas: o corte de dia passado e movimento reduzido saiu do hook para `sparksShown`, testada. |
| T46 | Legenda do painel de sessão encerrada vira "sessão inteira (10:00–10:40)" (campo `legend`); o total fica "N ações na sessão". |
| T54 | Teste exato do texto; a spec foi alinhada ao texto ampliado pelo R26. |
| T59 | Teste do caminho ao vivo: evento mesclado sobe tokens do agente, da sessão e do dia. |
| R21/R57 | Prova é o teste SQL manual `003_week_tokens.sql`, que passou no Supabase em 12/11; sem cópia em JS. |
| T30/T43 | Marca de nuvem e botão "Abrir a sessão" removidos da UI (sem dado que identifique a sessão); o caminho do painel passou de "Sessão local" para "Sessão", pois não dá para afirmar que é local. Registrado na spec como A confirmar. |
| R72, R1 | Mantidos; registrados na spec. |

Os commits `2d6f6ca`, `bffe877` e `69b682f` são de instância minha; `e883f25` (andamento do fechamento) não é meu.
