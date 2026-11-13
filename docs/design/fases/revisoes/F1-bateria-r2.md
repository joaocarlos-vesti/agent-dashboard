# F1 — Bateria r2 (após migração para Vite + React + TypeScript)

Branch `feat/mapa-vivo-v2-2`, HEAD `29f5acd`. Data 2026-11-12. Só leitura: nada foi corrigido.

## Comandos
- `npm test` (`vitest run`): **7 arquivos, 133 testes, 133 passam, 0 falham**. Exit 0.
- `npx tsc --noEmit`: **sem erros**. Exit 0.

Nenhum comando falhou.

## Arquivos de teste
`src/lib/{attention,board,activity,day,format,usage}.test.ts` e `hook/send.test.ts`. A rodada 1 era `web/*.test.js` (116 testes); a diferença de 17 são testes novos da F1 (correções da revisão) e não quebram nenhuma linha.

## Matriz F1 × testes (71 linhas: R1–R51 e R58–R77)
Casei cada linha pelo nome do teste (ou asserção) no vitest verbose. Todas as 71 linhas têm teste correspondente e verde.

| Linha | Teste (arquivo: nome) | Status |
|---|---|---|
| R1 | board: aguardando só com pedido de permissão | passou |
| R2 | board: aviso que não é permissão não muda o estado | passou |
| R3 | board: Stop deixa a sessão na sua vez | passou |
| R4 | board: aguardando há 2 h vira sua vez | passou |
| R5 | board: sua vez recente tem destaque | passou |
| R6 | board: sua vez antiga perde o destaque | passou |
| R7 | board: sessão rodando sem evento há mais de 10 minutos fica sem sinal | passou |
| R8 | board: ferramenta em andamento só fica sem sinal depois de 2 horas | passou |
| R9 | board: sessão com SessionEnd está encerrada | passou |
| R10 | board: evento novo tira a sessão de sua vez e de aguardando | passou |
| R11 | board: agente termina como concluído | passou |
| R12 | format: título conta só quem aguarda permissão | passou |
| R13 | format: ícone da aba com ponto quando há sua vez recente | passou |
| R14 | board: sessão parada de ontem não conta na aba; pedido de permissão de ontem ainda conta até virar sua vez | passou |
| R15 | day: evento entra no dia local, não no UTC | passou |
| R16 | day: limites do dia local em UTC | passou |
| R17 | day: seletor tem 7 dias | passou |
| R18 | board: tokens do dia não dobram sessão de dois dias | passou |
| R19 | board: tokens do agente entram no dia do término | passou |
| R20 | board: ações do dia contam só os eventos do dia | passou |
| R21 | board: semana soma os dias sem contar em dobro; usage: semana lista cada dia em valor absoluto | passou |
| R22 | day: marca de início diz ontem ou há N dias; board: sessão iniciada ontem leva a marca de início; board: SessionStart de retomada não conta como início | passou |
| R23 | board: sessão com eventos depois do dia leva a marca de continuação | passou |
| R24 | board: sessão aberta sem evento hoje vai para o grupo recolhido | passou |
| R25 | board: evento novo hoje traz a sessão de volta com a hora | passou |
| R26 | board: sessão sem o início guardado avisa | passou |
| R27 | activity: batimento conta ações em 20 janelas de 30 s; batimento ignora ação de há mais de 10 minutos | passou |
| R28 | activity: ritmo conta ações em 40 janelas de 15 s | passou |
| R29 | activity: ritmo de sessão encerrada vai do início ao fim | passou |
| R30 | activity: agente agiu há 12 s ou menos fica aceso | passou |
| R31 | board: workflow e sessão acendem quando um descendente agiu | passou |
| R32 | usage: mediana das chamadas | passou |
| R33 | usage: chamada acima do dobro da mediana fica fora da curva; o dobro exato da mediana não é fora da curva | passou |
| R34 | usage: duas chamadas nunca ficam fora da curva | passou |
| R35 | usage: veredito REPROVADO guarda o trecho do motivo com até 160 caracteres; APROVADO e "nenhum REPROVADO encontrado" não são reprovação | passou |
| R36 | usage: total de reprovadas é calculado no grupo, não por chamada | passou |
| R37 | attention: faixa lista reprovação recente; reprovação de workflow sai da faixa quando o workflow termina; reprovação de agente avulso fica 30 minutos | passou |
| R38 | attention: faixa lista agente sem nova ação há 10 min | passou |
| R39 | attention: faixa lista sessão sem sinal | passou |
| R40 | attention: faixa lista sua vez só até 30 min | passou |
| R41 | attention: quem aguarda você vem primeiro na faixa | passou |
| R42 | attention: faixa ignora o que não pede ação | passou |
| R43 | attention: sem fatos a faixa diz tudo certo | passou |
| R44 | board: mostrador conta agentes que agiram nos últimos 12 s | passou |
| R45 | board: mostrador conta ações do último minuto | passou |
| R46 | board: mostrador soma tokens só de hoje | passou |
| R47 | board: workflow grande esconde concluídos sem alerta; board: workflow grande traz o texto dos concluídos escondidos (`hiddenDoneLabel` = "4 concluídos · mostrar") | passou |
| R48 | board: workflow com 6 agentes mostra todos | passou |
| R49 | board: ordem não muda quando o estado muda | passou |
| R50 | board: aguardando sobe na faixa sem reordenar o mapa | passou |
| R51 | board: sessões encerradas vão para o grupo recolhido | passou |
| R58 | format: tempo relativo; horário exato no fuso informado | passou |
| R59 | format: ação vira verbo | passou |
| R60 | format: pasta pelo nome final | passou |
| R61 | format: painel mostra tokens de hoje e da sessão inteira | passou |
| R62 | format: números abaixo de mil; milhares; milhões e bilhões; arredondamento que chega a mil; contagem desconhecida como traço | passou |
| R63 | board: agente terminado expõe os tokens, com número principal só de entrada e saída | passou |
| R64 | hook/send: SubagentStop soma o uso… contando cada resposta uma vez; Stop soma o uso… contando cada resposta uma vez | passou |
| R65 | board: agentes avulsos são agrupados por tipo com chamadas, total, parte da sessão e reprovações | passou |
| R66 | board: agente de workflow recebe rótulo da tarefa; textos da tela não mostram ids | passou |
| R67 | board: agentes de workflow só são somados quando o início da tarefa é idêntico; uma letra de diferença separa os agentes | passou |
| R68 | usage: sem tokens na sessão o grupo não tem percentual; board: agentes avulsos (sessionShare) | passou |
| R69 | format: resumo do agente | passou |
| R70 | board: workflow fica concluído quando chega o aviso de término | passou |
| R71 | board: sessão nova hoje conta tudo; sem início guardado o dia começa do zero; board: sessão com início guardado não traz o aviso; board: sessão que começou sem SessionStart guardado não conta o primeiro Stop (aviso "início não guardado" em `startMissingNotice`) | passou |
| R72 | board: queda do acumulado não gera tokens negativos | passou |
| R73 | board: dia passado usa o fim do dia como agora; day: dia passado usa o fim do dia como agora | passou |
| R74 | board: com o painel desconectado o agora é a última atualização; day: idem | passou |
| R75 | attention: sessão sem sinal não repete os agentes dela na faixa | passou |
| R76 | activity: linha segue a atividade do filho; board: linha do agente acompanha o estado dele no board | passou |
| R77 | board: textos da tela não mostram ids | passou |

## Lacunas da rodada 1 (R22, R47, R71)
- **R22** (`SessionStart` com `resume` não conta como início): **fechada**. Teste `SessionStart de retomada não conta como início` em `src/lib/board.test.ts`.
- **R47** (texto "4 concluídos · mostrar"): **fechada**. Asserção `hiddenDoneLabel === '4 concluídos · mostrar'` em `src/lib/board.test.ts` (linha 468), além de `hiddenDone` = 4.
- **R71** (aviso "início não guardado"): **fechada**. Asserção `startMissingNotice === 'início não guardado'` em `src/lib/board.test.ts` (linha 445), e `null` quando há início guardado (linha 449).

## Totais (F1, rodada 2)
- Linhas da matriz F1: **71**
- **passou: 71**
- **falhou: 0**
- **faltando: 0**
- Lacunas da rodada 1: 3 de 3 fechadas.

## Observação
`docs/spec.md` tem alteração não commitada (2 linhas: registro da decisão de stack em 12/11). Não afeta o resultado dos testes.

## Veredito
**VERDE** (71 passou, 0 falhou, 0 faltando; `npm test` 133/133; `tsc --noEmit` limpo).
