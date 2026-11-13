# F3 — Bateria r1 (commit f699402, base 19d53f8)

Branch `feat/mapa-vivo-v2-2`, HEAD `f699402`. Data 2026-11-12. Só leitura: nada foi corrigido.

## Comandos
- `npm test` (`vitest run`): **19 arquivos, 355 testes, 355 passam, 0 falham**. Exit 0.
- `npx tsc --noEmit`: **sem erros**. Exit 0.
- `npx vite build`: **ok** (`✓ built in 646ms`). Exit 0. Aviso não bloqueante: chunk JS de 790 kB (acima de 500 kB).

Nenhum comando falhou. `git status`: só `docs/fases/revisoes/` não rastreado.

## Matriz de regras F3 (R78–R82)
| Linha | Teste (src/lib/ui-state.test.ts) | Status |
|---|---|---|
| R78 | como ler abre só na primeira visita | passou |
| R79 | escolher dia passado congela; hoje volta ao vivo | passou |
| R80 | clicar na faixa seleciona o item e abre o painel | passou |
| R81 | clicar em tokens abre os 7 dias; ? abre o como ler | passou |
| R82 | mostrar concluídos escondidos do workflow (+ abrir e fechar os grupos recolhidos) | passou |

Subtotal: 5 passou.

## Matriz de telas F3
Excluídas por serem F4 (fora desta fase): T9, T34, T57, T59.

**Passou (teste automatizado encontrado e verde): 46 linhas**
- T1–T7 (screen-state): carregando, erro, vazio hoje, vazio dia passado, pronto, sem login, sem acesso. 7 linhas.
- T8 (parte F3: "Como ler" abre na primeira visita, ui-state), T17 (parte F3: escolher ontem, ui-state), T20 (parte F3: um botão por fato, strip-model), T23 (parte F3: 7 dias, gauge-model), T24 (parte F3: "?" define tokens, gauge-model + ui-state), T35 (parte F3: workflow > 6 esconde concluídos, map-tree), T37 (parte F3: grupos recolhidos, map-tree). 7 linhas.
- T10, T11 (header-model: faixa de dia congelado, botão âmbar), T16 (header-model: horário com segundos). 3 linhas.
- T19 (strip-model), T22 (gauge-model), T25 (gauge-model: carregando, erro, vazio). 3 linhas.
- T27–T33 (card-model: estado, recente/antiga, começou ontem/continua/retomada, nuvem, ferramenta longa, sem nova ação, REPROVADO). 7 linhas.
- T36 (card-model: batimento de 20 barras). 1 linha.
- T42–T54 (detail-model: nada selecionado, permissão, sem branch, Agora, sessão encerrada, chamadas, chamadas 1–2, tokens, tokens não medidos, tarefa, sessão/workflow, vários dias, mais de 7 dias). 13 linhas.
- T60–T64 (detail-model e card-model: sem ações, sem chamadas, sem tarefa, dia passado no mostrador, card de agente avulso). 5 linhas.

**Navegador (linhas puras com Fase = navegador, fora do teste automatizado): 13 linhas**
- T12, T13, T14, T15, T18, T21, T26, T38, T39, T40, T41, T55, T56.
- Mais a parte de navegador das linhas "F3 + navegador": T8, T17, T20, T23, T24, T35, T37 (7 partes).

**Faltando: 1 linha**
- T58 (Conectar meu Claude Code: erro / sucesso / copiar, "já existe"): nenhum teste novo cobre o painel de conexão. Não há regressão automatizada para o que o painel já fazia.

Resumo das telas F3: passou 46, falhou 0, faltando 1, navegador 13 (+7 partes de navegador).

## Contagem geral (F3)
- Regras R78–R82: passou 5, falhou 0, faltando 0.
- Telas F3: passou 46, falhou 0, faltando 1; navegador 13 linhas (+7 partes).
- **Total: passou 51, falhou 0, faltando 1, navegador 13 linhas (+7 partes).**

## Observações
- Textos "pergunta" da spec (T1, T2, T25, T42, T50, T60, T61, T63) têm teste com texto da F3; a spec ainda não os fechou, então o texto exato precisa de confirmação do dono.
- Dívida registrada por `F3-implementacao.md`: "1 ações em 10 min" (singular errado, `detail-model`); não é falha de teste porque a spec não fixa essa redação.

## Veredito
**VERMELHO** por 1 linha faltando (T58, sem teste de regressão do painel de conexão). Não há falha de código: 355/355 testes, `tsc` limpo, build ok. As 13 linhas de navegador e as 7 partes de navegador ficam para o teste de navegador da F3, não contam como faltando.
