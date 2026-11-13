# F1 — Bateria r3 (commit 7667567: saída do aguardando e sua vez)

Branch `feat/mapa-vivo-v2-2`, HEAD `7667567`. Data 2026-11-12. Só leitura: nada foi corrigido.

## Comandos
- `npm test` (`vitest run`): **7 arquivos, 138 testes, 138 passam, 0 falham**. Exit 0.
- `npx tsc --noEmit`: **sem erros**. Exit 0.

Nenhum comando falhou.

## Cobertura de N1 e N2

**N1: aviso sem `agent_id` vai para a origem com ferramenta em andamento; expira 2 h após o aviso.**
- `src/lib/board.test.ts:69` `aviso sem origem vai para o único agente com ferramenta em andamento`: aviso sem origem com um agente com ferramenta em andamento → `waiting`; depois de uma ação irmã do mesmo agente → `running`. **Passou.**
- `src/lib/board.test.ts:75` `aviso sem origem com dois candidatos fica com a conversa principal`: dois agentes com ferramenta em andamento → aviso fica com a conversa principal. **Passou.** (Caso de borda extra, não exigido por N1.)
- `src/lib/board.test.ts:81` `aviso sem origem com ferramenta da conversa principal em andamento sai com o fim dela`: origem é a conversa principal; sai com o `PostToolUse` dela. **Passou.**
- `src/lib/board.test.ts:87` `aguardando expira 2 h depois do próprio aviso, mesmo com a sessão ativa`: aviso às 10:00 (sem `agent_id`), ação de agente às 11:59 não renova; 11:59:30 → `waiting`; 12:00:30 → `your_turn`. **Passou.** Cobre a expiração a partir do aviso, não de outro evento.

**N2: `idle_prompt` sem `Stop` antes → sua vez desde o aviso.**
- `src/lib/board.test.ts:93` `idle_prompt sem Stop antes (Esc no meio da ferramenta) deixa a sessão na sua vez desde o aviso`: ferramenta às 10:00 (60 min atrás), `idle_prompt` às 10:20 (40 min atrás) → `status: your_turn`, `sinceLabel: "sua vez desde 11:20"`, `statusSince` = hora do aviso, `lastAt` = hora da ferramenta. Com `UserPromptSubmit` depois → `running`. **Passou.**

Observação: `src/lib/board.test.ts:105` (teste antigo de `idle_prompt` com `Stop` antes) continua verde, o que confirma que o aviso sem `Stop` anterior é o único caso de "sua vez desde o aviso".

## Totais (F1, rodada 3)
- N1: **coberto**, 3 testes diretos + 1 de expiração (passou: 4, falhou: 0, faltando: 0).
- N2: **coberto**, 1 teste (passou: 1, falhou: 0, faltando: 0).
- Matriz F1 (rodadas 1 e 2, 71 linhas): não reexaminada nesta rodada; a suíte cresceu de 133 para 138 e nenhum teste falhou.

## Veredito
**VERDE** (138 testes passam, 0 falham; `tsc --noEmit` limpo; N1 e N2 com teste).
