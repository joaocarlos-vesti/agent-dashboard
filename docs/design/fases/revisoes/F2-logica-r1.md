REVISÃO DE LÓGICA — Painel de agentes F2 @ b9f540a · rodada 1

Escopo: ffe60a0..b9f540a. Rodei `npm test` (171/171) e `tsc --noEmit` (limpo). O SQL não foi executado: a migration 003 e a RPC foram lidas linha a linha, e refiz à mão as contas do teste 003.

Critérios da fase
- R52: atendido. send.sh envia `git -C "$cwd" branch --show-current` só no SessionStart. Fora de repositório git, com HEAD solto ou com pasta inexistente, vai `null`, sem erro (há 4 testes). O `git` local é rápido e o `curl` continua em segundo plano com `-m 2`, então a sessão não fica presa.
- R53: atendido. board.ts `branchOf` usa o último SessionStart que trouxe branch.
- R54: atendido. queries.ts `dayFilter` usa o `dayBounds` da F1, que já trata o horário de verão; o teste usa o fuso de São Paulo.
- R55: atendido como a matriz pede (as sessões que tiveram evento no dia). Mas o mesmo desenho perde as sessões abertas que não tiveram evento no dia: ver achados 1 e 2.
- R56: atendido. `fetchAllPages` para na página incompleta e transforma o erro na mensagem do Supabase, sem devolver dados pela metade. Os testes falhariam com a regra errada.
- R57: atendido na leitura. Conferi `week_tokens_of`: diferença entre Stops com `lag`, nunca negativa; o primeiro Stop só conta se o início está guardado; agente no dia do SubagentStop; dia pelo fuso com `at time zone`; janela de hoje e dos 6 dias anteriores; só o próprio login. As contas do teste 003 batem (SP 70/120/175 mil; UTC 170/20/175 mil), e um evento de outro login mudaria o dia 12, então o teste pega. Segurança: `week_tokens_of` sem execução para public, anon e authenticated; `my_week_tokens` com `security definer` e `search_path` fixo, `my_login()` e `is_member()`, sem SQL dinâmico.

Achados
1. [IMPORTANTE] src/lib/queries.ts:56-64 (`loadDayEvents`), usado em useDashboard.ts. Só carrega sessões que tiveram evento no dia. Uma sessão de ontem ainda aberta (sua vez, sem sinal, ou aguardando permissão desde 23:50) não vem do banco. Entrada: Notification permission_prompt às 23:50 de ontem e o painel aberto às 00:30. Resultado: o título da aba fica sem "(1)" (o R14 pede que conte), e o grupo "Abertas, sem atividade hoje" (R24) fica sempre vazio. Com a janela de 24 h, os dois funcionavam: isto é uma regressão.
   Corrigir em: `loadDayEvents`. Também buscar as sessões dos 7 dias cujo último evento antes do dia não é um SessionEnd, com o histórico delas. Teste no fake com uma sessão de ontem sem SessionEnd.
2. [IMPORTANTE] src/useDashboard.ts, canal ao vivo (`setEvents([...current, insertedEvent])`). Um evento novo de sessão que não foi carregada entra sozinho, sem o histórico da sessão. Entrada: sessão de ontem retomada hoje às 09:12. Resultado:
   - `startMissing` = true ("início não guardado") sem ser verdade;
   - o primeiro Stop vira só a base, então "hoje" fica sem os tokens dessa resposta;
   - a sessão não ganha a marca "retomada às 09:12" (R25) nem "começou ontem" (R22).
   Tudo fica errado até recarregar a página.
   Corrigir em: no evento ao vivo com `session_id` desconhecido, buscar o resto da sessão (o mesmo `eventsOfSessionsOutside`). O achado 1 reduz o caso, mas não o elimina: sessões de mais de 1 dia, ou abertas sem nenhum evento.
3. [MENOR] src/eventSource.ts:87. O `.or('created_at.lt.<ISO>,created_at.gte.<ISO>')` leva `:` e `.` sem aspas. A documentação do PostgREST pede aspas duplas para esses caracteres. Não foi medido na API: rodar uma vez ou usar `created_at.lt."${gte}"`.
4. [MENOR] src/lib/queries.ts:43. Se o `max-rows` do projeto for menor que 1000, a primeira página já vem incompleta e a consulta para calada, com dados pela metade. Confirmar `max-rows` = 1000 no Supabase.
5. [MENOR] src/useDashboard.ts. Um evento que chega pelo canal ao vivo e também pela carga gera duplicata. Um SubagentStop duplicado soma os tokens do agente duas vezes (`sessionTokens` soma todos os SubagentStop). Deduplicar por `id` ao juntar. O risco já existia antes.
6. [MENOR] hook/send.sh `result_excerpt`. Um APROVADO longo que cita uma reprovação anterior depois do caractere 160 (ex.: "a rodada 1 foi REPROVADO … VEREDITO: APROVADO") passa a começar no REPROVADO e vira reprovação no board. Preferir `VEREDITO: REPROVADO`, ou o último veredito do texto.
7. [MENOR] Fato novo: PermissionRequest. Se esse hook passar pelo send.sh, o evento chega ao board como evento de trabalho, porque o board não filtra tipo desconhecido. Vindo da mesma origem depois do Notification, ele limpa o "aguardando" (`clearsWaiting`). Até haver a medição, ignorar tipos de evento desconhecidos no `isRelevantEvent`.
8. [MENOR] supabase/migrations/003_v2_2.sql, `session_start`. Para achar o primeiro evento da sessão, ignora só o `idle_prompt`. O navegador ignora todo Notification que não é de espera nem de idle (ex.: `auth_success`). É uma divergência pequena entre a semana do banco e a do navegador.

Conferido sem achado:
- descarte de resposta de carga antiga (`latestLoad`);
- erro mostrado com a mensagem;
- `drop` da assinatura antiga sem nenhum chamador;
- `ingest` com a branch é compatível com o hook antigo;
- `security definer` sem vazamento;
- sessão com mais de 7 dias cai em `startMissing` no banco e no navegador;
- testes do hook para o REPROVADO além do caractere 160.

Perguntas de produto: nenhuma.

VEREDITO: REPROVADO
