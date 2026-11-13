# F1 — Bateria r1 (testes e matriz)

Branch `feat/mapa-vivo-v2-2`. Data 2026-11-12. Só leitura: nada foi corrigido.

## Comando 1: `node --test web/*.test.js`
Resultado: 116 testes, **116 passam, 0 falham**, 0 pulados, 0 todo.
Nenhum comando falhou. (Um `ls` de conferência retornou erro porque `docs/fases/revisoes` ainda não existia; era esperado e foi criado para este arquivo.)

## Comando 2: matriz F1 × testes
Linhas F1 da tabela "Matriz de testes — regras de negócio" de `docs/spec.md`: R1–R51 e R58–R77 (71 linhas). R52–R57 são F2 e R78–R82 são F3, fora desta bateria.
Método: cada linha foi casada com o nome do teste em `web/*.test.js` (mapa em `docs/fases/F1-implementacao.md`), e os valores esperados foram conferidos no corpo dos testes (`grep` de literais e leitura dos corpos dos testes de maior risco). Os números entre parênteses são as posições no `node --test` (`ok N`).

| Linha | Regra (resumo) | Teste (arquivo: nome) | Status | Obs. |
|---|---|---|---|---|
| R1 | Permissão deixa aguardando | board: aguardando só com pedido de permissão (19) | passou | |
| R2 | Aviso que não é permissão não muda estado | board: aviso que não é permissão não muda o estado (21) | passou | asserta "sua vez desde 11:20" |
| R3 | Stop vira sua vez | board: Stop deixa a sessão na sua vez (23) | passou | |
| R4 | Aguardando 2 h vira sua vez | board: aguardando há 2 h vira sua vez (24) | passou | |
| R5 | Sua vez recente tem destaque até 30 min | board: sua vez recente tem destaque (25) | passou | literal "terminou há 29 min" no corpo |
| R6 | Sua vez antiga perde destaque | board: sua vez antiga perde o destaque (26) | passou | |
| R7 | Sem evento há 10 min = sem sinal | board: sessão rodando sem evento há mais de 10 minutos fica sem sinal (27) | passou | |
| R8 | Ferramenta em andamento só some em 2 h | board: ferramenta em andamento só fica sem sinal depois de 2 horas (28) | passou | |
| R9 | SessionEnd encerra | board: sessão com SessionEnd está encerrada (29) | passou | |
| R10 | Evento novo tira de sua vez/aguardando | board: evento novo tira a sessão de sua vez e de aguardando (30) | passou | |
| R11 | Agente termina como concluído | board: agente termina como concluído (33) | passou | |
| R12 | Título conta só quem aguarda permissão | format: título conta só quem aguarda permissão (94) | passou | literal "(2) Painel de agentes" |
| R13 | Ponto no ícone com sua vez recente | format: ícone da aba com ponto quando há sua vez recente (95) | passou | |
| R14 | Sessão parada de ontem fora do título; waiting de ontem ainda conta | board: sessão parada de ontem não conta na aba (72); pedido de permissão de ontem ainda conta (73) | passou | |
| R15 | Dia pelo fuso local | day: evento entra no dia local, não no UTC (80) | passou | |
| R16 | Limites do dia local em UTC | day: limites do dia local em UTC (81) | passou | |
| R17 | Seletor com 7 dias | day: seletor tem 7 dias (82) | passou | confere "Hoje", "Ontem", "ter 10", "sex 6" |
| R18 | Tokens do dia não dobram | board: tokens do dia não dobram sessão de dois dias (58) | passou | |
| R19 | Tokens do agente no dia do término | board: tokens do agente entram no dia do término (60) | passou | |
| R20 | Ações do dia sem dobrar | board: ações do dia contam só os eventos do dia (61) | passou | |
| R21 | Semana soma sem dobrar | board: semana soma os dias sem contar em dobro (62); usage: semana lista cada dia em valor absoluto (116) | passou | |
| R22 | Marca "começou ontem às HH:MM" | board/day: sessão iniciada ontem leva a marca de início (65); marca de início diz ontem ou há N dias (86) | passou | parcial: "SessionStart com resume não conta como início" não tem asserção própria |
| R23 | Marca "continua hoje" | board: sessão com eventos depois do dia leva a marca de continuação (66); day (87) | passou | |
| R24 | Abertas sem atividade hoje no grupo recolhido | board: sessão aberta sem evento hoje vai para o grupo recolhido (67) | passou | |
| R25 | Retomada com hora | board: evento novo hoje traz a sessão de volta com a hora (68) | passou | literal "retomada às 09:12" |
| R26 | Início fora dos 7 dias avisa | board: sessão sem o início guardado avisa (69) | passou | resume e não-resume conferidos |
| R27 | Batimento 20 × 30 s | activity: batimento conta ações em 20 janelas de 30 s (1); ignora ação de mais de 10 min (2) | passou | |
| R28 | Ritmo 40 × 15 s | activity: ritmo conta ações em 40 janelas de 15 s (3) | passou | |
| R29 | Ritmo de sessão encerrada início → fim | activity: ritmo de sessão encerrada vai do início ao fim (4) | passou | |
| R30 | Agiu há ≤ 12 s fica aceso | activity: agente agiu há 12 s ou menos fica aceso (5) | passou | |
| R31 | Aceso propaga ao pai | board: workflow e sessão acendem quando um descendente agiu (54) | passou | |
| R32 | Mediana | usage: mediana das chamadas (107) | passou | [10,20,90]→20; [10,20,30,40]→25 |
| R33 | Fora da curva: > 2× mediana, 3+ chamadas | usage: acima do dobro da mediana fica fora da curva (108); o dobro exato não é fora da curva (109) | passou | |
| R34 | Menos de 3 chamadas não marca | usage: duas chamadas nunca ficam fora da curva (110) | passou | |
| R35 | REPROVADO vem do resultado | usage: veredito REPROVADO guarda o trecho com até 160 caracteres (111); APROVADO e "nenhum REPROVADO" não são reprovação (112) | passou | |
| R36 | Total de reprovadas uma vez no grupo | usage: total de reprovadas é calculado no grupo (114) | passou | |
| R37 | Faixa lista reprovação recente | attention: faixa lista reprovação recente (8); reprovação de workflow sai ao terminar (9); avulso fica 30 min (10) | passou | |
| R38 | Faixa: sem nova ação há ≥ 10 min | attention: faixa lista agente sem nova ação há 10 min (11) | passou | literal "sem nova ação há 14 min" |
| R39 | Faixa: sem sinal | attention: faixa lista sessão sem sinal (12) | passou | |
| R40 | Faixa: sua vez só até 30 min | attention: faixa lista sua vez só até 30 min (13) | passou | |
| R41 | Aguardando primeiro na faixa | attention: quem aguarda você vem primeiro na faixa (14) | passou | |
| R42 | Faixa ignora o que não pede ação | attention: faixa ignora o que não pede ação (15) | passou | |
| R43 | Faixa vazia: "Tudo certo" | attention: sem fatos a faixa diz tudo certo (17) | passou | |
| R44 | Mostrador: agentes agindo ≤ 12 s | board: mostrador conta agentes que agiram nos últimos 12 s (77) | passou | |
| R45 | Mostrador: ações do último minuto | board: mostrador conta ações do último minuto (78) | passou | |
| R46 | Mostrador: tokens de hoje | board: mostrador soma tokens só de hoje (79) | passou | |
| R47 | Workflow > 6 esconde concluídos | board: workflow grande esconde concluídos sem alerta (52) | passou | parcial: `hiddenDone` = 4 conferido; o texto "4 concluídos · mostrar" não tem asserção |
| R48 | Workflow com até 6 mostra todos | board: workflow com 6 agentes mostra todos (53) | passou | |
| R49 | Ordem fixa pela hora de início | board: ordem não muda quando o estado muda (74) | passou | |
| R50 | Aguardando sobe só na faixa | board: aguardando sobe na faixa sem reordenar o mapa (75) | passou | P4 segue pendente na spec |
| R51 | Encerradas hoje recolhidas | board: sessões encerradas vão para o grupo recolhido (76) | passou | |
| R58 | Tempo relativo e horário exato | format: tempo relativo (96); horário exato no fuso informado (97) | passou | 40 s "agora", 3 min, 2 h, 1 dia, 2 dias |
| R59 | Ação vira verbo | format: ação vira verbo (98) | passou | "editou spec.md", "rodou npm test" |
| R60 | Pasta pelo nome final | format: pasta pelo nome final (99) | passou | |
| R61 | "hoje: X · sessão inteira: Y" | format: painel mostra tokens de hoje e da sessão inteira (100) | passou | |
| R62 | Formato curto de tokens | format: números abaixo de mil (88); milhares (89); milhões e bilhões (90); arredondamento até mil (91); traço (92) | passou | |
| R63 | Principal = entrada + saída, sem cache | board: agente terminado expõe os tokens, com número principal só de entrada e saída (41) | passou | |
| R64 | Mesma resposta não conta duas vezes | send: SubagentStop soma… contando cada resposta uma vez (42); Stop soma… (50) | passou | |
| R65 | Avulsos agrupados por tipo | board: agentes avulsos são agrupados por tipo… (45) | passou | fixture com 2 logic-reviewer + 1 general-purpose (a matriz cita 3 + Explore); mesma regra |
| R66 | Rótulo curto da tarefa | board: agente de workflow recebe rótulo da tarefa (49); textos da tela não mostram ids (50) | passou | "Revise a lógica da" e "agente 2/3" |
| R67 | Soma só com início idêntico | board: agentes de workflow só são somados quando o início é idêntico (46); uma letra de diferença separa (47) | passou | |
| R68 | % da sessão; sem % se sessão 0 | board: agentes avulsos… (45) com sessionShare 0,5; usage: sem tokens na sessão não tem percentual (115) | passou | |
| R69 | Linha por agente | format: resumo do agente (101) | passou | literal "3 chamadas · total 45 mil · 25% da sessão · 1 reprovou" |
| R70 | Workflow concluído com UserPromptSubmit | board: workflow fica concluído quando chega o aviso de término (34) | passou | |
| R71 | Base do dia sem Stop anterior | board: sessão nova hoje conta tudo; sem início guardado o dia começa do zero (63) | passou | parcial: aviso "início não guardado" só verificado pela flag `startMissing` (teste 69), sem o texto |
| R72 | Queda do acumulado sem negativo | board: queda do acumulado não gera tokens negativos (64) | passou | valor 195 mil (decisão 4 da F1-implementacao) |
| R73 | Dia passado congela o relógio | board: dia passado usa o fim do dia como agora (70, 83) | passou | |
| R74 | Painel caído congela o relógio | board: com o painel desconectado o agora é a última atualização (71, 85) | passou | |
| R75 | Faixa sem repetição de agentes | attention: sessão sem sinal não repete os agentes dela na faixa (16) | passou | |
| R76 | Estado da linha | activity: linha segue a atividade do filho (6); board: linha do agente acompanha o estado (56) | passou | flow / dashed / idle |
| R77 | Sem ids na tela | board: textos da tela não mostram ids (50) | passou | "agente 2", sem `wf_` nem `agent_id` |

## Totais (F1)
- Linhas da matriz F1: **71**
- **passou: 71**
- **falhou: 0**
- **faltando: 0**

Lacunas de asserção (linha passa, mas um detalhe da linha não tem teste próprio). Não bloqueiam, mas valem o registro:
- R22: a regra "SessionStart com resume não conta como início" não tem asserção própria.
- R47: o texto "4 concluídos · mostrar" não é conferido (só o número `hiddenDone`).
- R71: o aviso textual "início não guardado" não é conferido (só a flag `startMissing`).

## Veredito
**VERDE** (71 passou, 0 falhou, 0 faltando; 3 lacunas de asserção registradas).
