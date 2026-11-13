# Revisão UX/UI — rodada 1 (13/11/2026)

Olhar de Product Designer sobre https://painel-agentes-nine.vercel.app (branch `feat/mapa-vivo-v2-2`), com dados reais do dono, comparado à spec (Direção visual v2.2, Estados) e ao protótipo (`MapaR.dc.html`, extraído do pacote em `docs/design/`).

**Veredito: precisa de retrabalho.** O retrabalho é pontual, mas o mapa não responde ao clique do mouse, e esse é o gesto principal da tela.

| Severidade | Qtde |
|---|---|
| Crítico | 1 |
| Alto | 4 |
| Médio | 5 |
| Baixo | 4 |

---

## Crítico

### C1. O clique do mouse nos cards do mapa não faz nada
- **Onde:** `src/components/map/MapView.tsx` (props do `<ReactFlow>` e `nodeOf`) e `src/styles/map.css`.
- **Evidência:** na tela em produção, a 1440 px, cliquei no corpo do card "agent-dashboard", no corpo do card "general-purpose" e no botão do card pelo leitor de acessibilidade. Nos três casos o painel continuou mostrando "Clique numa sessão ou num agente para ver o detalhe." O chip da faixa de atenção funcionou e abriu o detalhe.
- **Causa:** no `@xyflow/react`, um nó só recebe eventos do ponteiro (`pointerEvents: 'all'`) quando é selecionável ou arrastável, ou quando tem `onClick` ou `onMouse*` (`node_modules/@xyflow/react/dist/esm/index.js:2266` e `:2362`). Os nós são criados com `selectable:false` e `draggable:false`, sem `onNodeClick`, e por isso ficam com `pointer-events: none`. O clique atravessa o card e cai no fundo do mapa. Isso derruba o clique no corpo (abrir o detalhe), a seta (expandir), "N concluídos · mostrar" e "Encerradas hoje".
- **Impacto:** explica a queixa 2 ("clico no card e ele não expande"): hoje o card não faz nada. Pelo teclado deve funcionar, porque o foco não depende de `pointer-events`, mas não testei.
- **Recomendação:**
  ```css
  /* map.css */
  .map-canvas .react-flow__node { pointer-events: all; }
  ```
  Outra saída é passar `onNodeClick={() => {}}` ao `<ReactFlow>`. Depois, incluir um teste de navegador que clique num card e confira o painel.

## Alto

### A1. O clique no card deveria abrir o detalhe e expandir os filhos, como no protótipo
- **Onde:** `MapCard.tsx` e `useDashboardView.ts` (`activateCard`).
- **Fato:** no protótipo, `clicar: () => alternar(id)`, e `alternar` faz duas coisas: abre ou fecha os filhos e seleciona o card (`setState({ abertos, sel: id })`). O card inteiro tem `aria-expanded`. A separação "corpo abre o detalhe, seta expande" foi decisão do condutor e não está no protótipo.
- **Problema:** a seta é um alvo de cerca de 28 px, cinza `--faint`, e mostra só o número. Quem clica no card de uma sessão espera ver os filhos dela. Com a separação, a pessoa clica, vê o detalhe e o mapa não se abre, o que parece defeito.
- **Recomendação:**
  - Voltar ao comportamento do protótipo: o clique no corpo seleciona e, se o card tiver filhos fechados, abre os filhos.
  - Não fechar os filhos quando o card já está selecionado e aberto, para que o segundo clique não esconda o que a pessoa acabou de ver.
  - Manter a seta como atalho para recolher, com `title` "Recolher os 5 itens".

### A2. "Falta cor": a paleta é a mesma do protótipo, mas o protótipo usa a cor em mais lugares
- **Onde:** `base.css`, `map.css`, `gauge.css` e `HeartbeatBars`.
- **Fato:** os tokens são idênticos aos do protótipo (`C` = `:root`). A diferença está em onde a cor aparece. Com dados reais, quase tudo fica "concluído" ou "encerrado", em cinza; só o agente que está agindo ganha terracota (foi o que vi no print). Faltam estes pontos de cor do protótipo:
  1. **Brilho terracota na linha da última ação** (`brilhoA`/`brilhoB`, 1,6 s, fundo `rgba(217,119,87,.32)`) a cada ação nova. Não existe no código, que só tem `number-flash` nos tokens.
  2. **Pulso verde ao concluir** (`concluiu`, sombra `#6FD3B8`) no card que acabou de terminar. Não existe.
  3. **Barra de "hoje" na semana em terracota claro** (`#F0A385`), e dia passado selecionado em `#C9D3E0`. No código, `.meter__fill` é `--soft` (cinza).
  4. **Horário de "aguardando" em âmbar claro** (`tempoCor #FFCF85`). No código fica âmbar puro.
  5. Ritmo do detalhe: no protótipo, a última coluna é terracota (`j >= 38 ? '#F0A385' : C.brand`). Confirmar no `ActivitySection`.
- **Recomendação:** implementar os itens 1 a 3. São os que fazem o mapa parecer vivo sem quebrar a regra de que âmbar é só para "aguardando você" e de que só eventos reais se mexem. Não pintar o texto do estado, porque a spec proíbe.

### A3. Sessões com o mesmo nome não se distinguem
- **Onde:** `card-model.ts` (`sessionParts`: o título é `folderName(cwd)`).
- **Evidência:** três ou quatro cards "vesti_comprador" empilhados, com estados diferentes ("sua vez", "rodando · 0 tokens").
- **Recomendação:** quando o nome da pasta se repete no dia, acrescentar a branch (Geist Mono, como a spec permite) ou "iniciada às HH:MM" na linha do título.

### A4. Detalhe do estado cortado em cards estreitos
- **Onde:** `.map-card__state-detail` (`text-overflow: ellipsis`).
- **Evidência:** "rodando h…", "terminou há…" e "sem agent…" aparecem cortados. O tempo é justamente o fato que responde à pergunta 2 ("algo parou?").
- **Recomendação:** deixar a linha quebrar (`flex-wrap: wrap`), já que a spec diz que nada é cortado, ou mover as barrinhas para a linha de tokens.

## Médio

- **M1. O mostrador contradiz o card.** O card do agente mostrava "rodando · agora" enquanto o mostrador dizia "0 agindo". As duas coisas medem janelas diferentes (12 s contra "agora" < 1 min), mas o usuário lê como contradição. Sugestão: renomear para "agindo agora (12 s)" ou alinhar as duas regras (`Gauge.tsx` e `card-model`).
- **M2. Botão sem nome acessível.** O leitor de acessibilidade lista um `button` sem rótulo (ref_10) entre "Sair" e "Recolher tudo". Provavelmente é o chip da faixa ou o botão de "aguardando". Conferir `AttentionStrip` e `Header` e dar `aria-label` com nome e fato.
- **M3. Seletor de dia sem "Hoje" no nome acessível.** O botão diz "sexta-feira, 13 de novembro", enquanto a tela mostra "Hoje". Sugestão: "Hoje, sexta-feira, 13 de novembro".
- **M4. Painel vazio ocupa cerca de 22% da tela a 1440 px** com uma frase só. Aproveitar o espaço com o resumo do dia (tokens, sessões, faixa) ou com a dica "clique num card".
- **M5. Atribuição "React Flow" visível no canto do mapa.** Usar `proOptions={{ hideAttribution: true }}` só se a licença permitir; se não permitir, deixar como está e aceitar.

## Baixo

- **B1.** Títulos de agentes longos ("vesti-storefront:criterion-v…") perdem a parte que identifica o agente. Sugestão: tirar o prefixo do plugin ("criterion-verifier") e deixar o nome completo no `title`.
- **B2.** "0 tokens · sem agentes" em sessão rodando parece erro. Sugestão: "tokens ao terminar" ou "—".
- **B3.** O contorno de seleção é branco, `outline 2px --text`, igual ao foco de teclado. É coerente com o protótipo, mas confunde foco com seleção. Aceitável.
- **B4.** O "Recolher tudo" fica sozinho no topo direito do mapa, longe do mostrador. Preferência estética.

## Não verificado
- **Larguras de 1200 e 720 px:** `resize_window` não mudou a janela (está maximizada). A árvore vertical e o painel por cima ficaram sem teste visual.
- **Teclado** (Tab até o card + Enter) e **movimento reduzido:** não testei na tela; pelo código, devem funcionar.
- **Estados "aguardando você", REPROVADO, sem sinal, dia passado, queda de conexão e dados extremos:** não havia esses dados no dia. Avaliei só pelo código e pelo protótipo.
- **Contraste:** não medi com ferramenta. `--faint #8F8B84` sobre `#17171A` dá cerca de 5,3:1 (passa no AA).

## Os ajustes de maior impacto
1. **C1:** devolver o clique do mouse aos cards (`pointer-events: all` nos nós).
2. **A1:** o clique no card abre o detalhe e expande os filhos, como no protótipo.
3. **A2:** brilho da última ação, pulso verde ao concluir e barra de "hoje" em terracota.
4. **A3 e A4:** diferenciar sessões de mesmo nome e parar de cortar o tempo do estado.
5. **M1:** alinhar "agindo" do mostrador com "rodando · agora" do card.
