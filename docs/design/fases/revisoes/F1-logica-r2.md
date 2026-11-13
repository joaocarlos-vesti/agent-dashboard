REVISÃO DE LÓGICA — Painel de agentes F1 @ 29f5acd · rodada 2

Escopo: correções em a1a7795..b5b8023 e conversão para TS em b5b8023..29f5acd. Vitest 133/133, `tsc --noEmit` limpo. Os casos de borda foram rodados direto na versão JS de b5b8023, copiada para o scratchpad, porque a lógica é idêntica à do TS.

Achados da rodada 1
1. BLOQUEANTE R72: corrigido. usage.ts `growthSince` usa max(0, …). 160 → 20 → 35 mil dá 175 mil; o teste espera 175000.
2. IMPORTANTE `agent_needs_input`: corrigido (board.ts, `WAITING_NOTIFICATION_TYPES`). Na regra nova de saída do "aguardando" sobraram os achados N1 e N2 abaixo.
3. IMPORTANTE semana: corrigido. `buildWeekTokens` agrupa todos os eventos carregados. Sessão encerrada ontem dá 100 mil (rodei), e o total não muda com o dia visto.
4. IMPORTANTE ponto da aba (R14): corrigido. App.tsx:14 passa só `person.sessions`; há teste com o horário 00:10.
5–9. MENORES: todos corrigidos (relógio do navegador, retomada, `startMissing`, dia de Santiago sem meia-noite, teste de 7199 s).

Conversão Vite/TS: comportamento igual ao de b5b8023. Diferenças que encontrei:
- guardas de `runId`/`agent_id` nulos, que evitam um workflow sem `runId` virar "concluído" com qualquer prompt;
- `describeAction` sem ferramenta devolve `undefined`.

Os testes têm as mesmas asserções. Só ganharam tipos, um `assert.ok` e o objeto completo no teste de `attentionHeadline`. Nenhum teste ficou mais fraco.

Achados novos (código que mudou nesta rodada)
N1. [IMPORTANTE] src/lib/board.ts `clearsWaiting`/`pendingWaitingOf`. Quando o aviso não traz `agent_id`, só um evento da conversa principal limpa o "aguardando". Entrada: SubagentStart a1, PreToolUse(a1, Bash), Notification permission_prompt sem agent_id, PostToolUse(a1) e o a1 seguindo com ações. Resultado: "aguardando você" durante todo o trabalho do a1. Com o a1 ativo por 5 h, a sessão ficou "waiting" desde 07:02 (rodei). Ela conta no título da aba e nunca expira, porque as 2 h são medidas desde o último evento. Ninguém mediu se o `Notification` de um subagente traz `agent_id`: a spec diz "formato a confirmar", e o relatório também não mediu. Se não trouxer, esse erro é o mesmo bug que a spec corrige: um "aguardando" falso no título.
   Corrigir em: `pendingWaitingOf`. Atribuir o aviso sem `agent_id` à origem que tinha um `PreToolUse` sem fim no momento do aviso (se houver uma só), e limpar com o próximo evento dessa origem. Teste com o caso acima. Medir no primeiro uso real.
N2. [IMPORTANTE] src/lib/board.ts `isRelevantEvent`. A decisão "idle_prompt = sua vez" só vale quando há um Stop antes. Entrada: PreToolUse(Bash), o dev aperta Esc (o Claude Code não dispara Stop em interrupção) e chega `idle_prompt`. Resultado: "running", porque a ferramenta ficou em andamento, até 2 h ("rodando há N min"). O certo seria "sua vez". Antes da F1 esse caso dava "aguardando".
   Corrigir em: tratar `idle_prompt` como evento de "sua vez". `statusSince` é o do último Stop quando ele é o último evento real; senão, é o do aviso. Manter o R2: Stop às 11:20 seguido de idle_prompt dá "sua vez desde 11:20". Teste do caso Esc.
N3. [MENOR] src/useDashboard.ts. Ainda carrega uma janela de 24 h. Com o `startMissing` novo, toda sessão iniciada há mais de 24 h mostra "início não guardado", embora o início esteja no banco. Some com o R55 (F2).

Conferido sem achado: 175 mil; semana sem dobrar; ponto e título da aba; o "agora" como max(relógio, último evento) só ao vivo; retomada pelo estado anterior; limites de Santiago; as mesmas asserções em Vitest.

Perguntas de produto: nenhuma.

VEREDITO: REPROVADO
