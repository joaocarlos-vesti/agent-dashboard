REVISÃO DE LÓGICA — Painel de agentes F4 @ 389a6e2 · rodada 2

Escopo: 5c60f85..389a6e2. Commits: fecd487 (faísca), daa0e8b (menores), 42aaa09 e 389a6e2 (só documentação). Rodei `npm test` (394/394, 21 arquivos), `tsc --noEmit` (limpo) e `vite build` (ok).

Coerência dos commits paralelos
- Depois de daa0e8b, só mudou documentação (`F4-implementacao.md` e `spec.md`), então o código final é o de daa0e8b.
- Não há duplicação nem conflito: sobrou um único `SparkLayer`, nenhum `animateMotion` ou `SparkDot`, um único `@keyframes spark-run` e uma única definição de `.tree-spark`.
- Juntar commits: o 389a6e2 tem mensagem `fix(painel): faísca anima em linha já montada`, mas só mexe numa tabela do `F4-implementacao.md`, e a mensagem engana. Sugiro juntá-lo ao 42aaa09 (`docs: andamento da F4`), ou reescrever a mensagem como `docs(...)`. O fecd487 (faísca) e o daa0e8b (menores) tratam coisas diferentes e podem ficar separados.

Achados da rodada 1
1. BLOQUEANTE, faísca SMIL parada em linha já montada: corrigido.
   - A faísca agora é CSS (`offset-path` com `@keyframes spark-run`; `animation-delay` escalona as linhas, `reverse` faz a volta), numa camada própria (`SparkLayer` via `ViewportPortal`), fora das linhas que o React Flow recria a cada batida.
   - A chave `sparkKey:edge.id` é estável, então o elemento e a animação sobrevivem às renderizações. O `fill-mode: both` deixa a faísca invisível durante o atraso. O pior caso, 2 × 350 + 900 = 1,6 s, cabe nos 3 s de vida da faísca.
   - Com movimento reduzido, as faíscas não são criadas.
   - A medição do construtor no DOM confirma a animação rodando, no mesmo elemento até o fim, numa linha montada há mais de 4 s.
2. MENOR, timers ao desmontar: corrigido. Os timers ficam num conjunto e são cancelados ao desmontar.
3. MENOR, recálculo a cada segundo: melhorado.
   - `header`, `gauge` e `detail` estão em `useMemo`.
   - O `liveClockMs` lê do fim e para no primeiro evento antigo.
   - Os ~53 ms do `buildBoard` com 4.812 eventos, uma vez por segundo e só com ação nos últimos 13 s: aceito para a v1.

Achado novo
N1. [MENOR] Só dá para ver olhando a tela: em dia pesado, a pausa de ~53 ms por segundo pode fazer a faísca engasgar, se o navegador não acelerar o `offset-distance` fora da thread principal. Se aparecer, tornar o `buildBoard` incremental por sessão.

VEREDITO: APROVADO
