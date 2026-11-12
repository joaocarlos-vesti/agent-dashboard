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
