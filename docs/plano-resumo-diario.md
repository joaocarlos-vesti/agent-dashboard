# Plano: resumo diário de uso (tabela `daily_usage`)

Status: plano, nada implementado. Data: 13/11/2026.

## Para que serve (em palavras simples)

Hoje o painel só enxerga os últimos 7 dias, porque os eventos são apagados depois disso. O resumo diário é uma tabela pequena que guarda, para cada dia já terminado, **só números**: quantos tokens cada dev gastou, em qual sessão, em qual agente e em qual modelo. Depois que o dia está resumido, os eventos brutos podem ser apagados sem perder o histórico.

Chamo de **dia fechado** um dia local que já terminou no fuso do dev. Chamo de **marca d'água** (`summarized_through`) a data até onde o resumo de um dev já foi feito.

## O que existe hoje (lido do repositório)

- `events` guarda tudo (`supabase/schema.sql`). Não há limpeza ativa: o `cleanup.sql` (agenda `limpa-eventos`, apaga com mais de 7 dias) nunca foi rodado, então o banco tem tudo desde 12/11.
- `week_tokens_of(login, fuso, agora)` (migrations 003 e 004) é a regra de "sem contar em dobro":
  1. A conversa principal manda o **acumulado** a cada `Stop`; o gasto é a diferença para o `Stop` anterior da mesma sessão.
  2. Se o acumulado cai (compactar ou limpar), a diferença vira 0 (`greatest(0, ...)`): a conversa recomeçou e a base passa a ser o valor novo.
  3. O primeiro `Stop` guardado da sessão só conta inteiro se o início da sessão está guardado (`SessionStart` diferente de `resume`). Senão é só base e conta 0.
  4. Agente: cada `SubagentStop` traz o total daquele agente e soma inteiro, no dia em que terminou.
  5. O dia é o do fuso informado; dia com soma zero não aparece.
- Usa `created_at` (hora em que o banco recebeu) para ordenar e para definir o dia.
- O hook (`hook/send.sh`) soma os tokens do arquivo da conversa, sem repetir `message.id`. O `Stop` lê o arquivo principal; o `SubagentStop` lê o arquivo do agente.
- Todas as funções de dados são `security definer`, e as que o painel chama usam `my_login()` + `is_member()`.

## Decisões propostas

| # | Assunto | Decisão |
|---|---|---|
| D1 | Fuso | Coluna `members.time_zone` (padrão `America/Sao_Paulo`). O "dia" do resumo é o dia desse fuso. Cada dia, depois de resumido, fica congelado: mudar de fuso só vale dali em diante. |
| D2 | Quem escreve | Só funções com `security definer` (cron e importação). A tabela não tem política de escrita para ninguém. |
| D3 | Hora do evento | `coalesce(occurred_at, created_at)` para o dia **e** para a ordem dos `Stop`. Isso corrige um problema real: evento entregue atrasado (computador offline) fora de ordem gera diferença negativa que o `greatest(0, ...)` esconde como perda de tokens. |
| D4 | Modelo | Vem de `tokens_by_model`. Sem esse campo, o modelo é `'desconhecido'`. O valor fica como o Claude informa (`claude-opus-5-5`); nomes amigáveis são trabalho da tela. |
| D5 | Rótulo do agente (`agent_label`) | Conversa principal = `'principal'`. Agente avulso = `agent_type`. Agente de workflow (tipo genérico `workflow-subagent`) = `'workflow: ' || workflow_name`. Nunca o texto da tarefa (pode ter dado de negócio). |
| D6 | Agendamento | pg_cron roda em UTC. Proposta: `0 6 * * *` = 03:00 de São Paulo o ano todo (o Brasil não tem horário de verão desde 2019). A função resume **todos os dias fechados que faltam** de cada dev, então um dia perdido se corrige sozinho na próxima rodada e fusos diferentes funcionam (dia fechado depende do fuso de cada dev, não do relógio do cron). |
| D7 | Resumo e limpeza num trabalho só | Um único job chama `daily_maintenance()`: primeiro resume, depois apaga. A limpeza nunca roda antes do resumo, e só apaga o que a marca d'água já cobre. |
| D8 | Local vence eventos | Para um dia que já tem linhas `source = 'local'`, o resumo por eventos **pula o dia inteiro** (senão somaria os dois). |

## Parte 1: tabela `daily_usage` e RLS (tamanho P, ~0,5 h)

Migration nova `supabase/migrations/007_resumo_diario.sql` (a 006 fica reservada para o outro agente, que mexe em `events`; para a ordem não importar, as duas usam `add column if not exists`).

```sql
create table if not exists daily_usage (
  login text not null references members on delete cascade,
  day date not null,                      -- dia local no fuso do dev na época
  session_id text not null,
  agent_label text not null,              -- 'principal' | tipo do agente | 'workflow: nome'
  model text not null,                    -- 'desconhecido' quando não há dado
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_creation_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  calls integer not null default 0,
  duration_ms bigint not null default 0,
  source text not null default 'events',  -- 'events' ou 'local' (acréscimo meu, ver P1)
  updated_at timestamptz not null default now(), -- acréscimo meu
  primary key (login, day, session_id, agent_label, model)
);
alter table daily_usage enable row level security;
create policy own_daily_usage_read on daily_usage for select to authenticated
  using (login = my_login() and is_member());
```

- Sem política de insert, update ou delete: nem o dev autenticado nem o anônimo escrevem.
- Índice `(login, day)` já vem da chave primária.
- Acréscimos além do pedido: `source` (necessário para D8 e para saber de onde veio o número) e `updated_at`. Peço OK (P1).
- `members.time_zone text not null default 'America/Sao_Paulo'` e `members.summarized_through date` (a marca d'água).
- Fuso inválido não pode derrubar o resumo de todo mundo: validar na gravação (função `set_my_time_zone(tz)` conferindo contra `pg_timezone_names`) e, no resumo, tratar cada dev num bloco com `exception` (ver Parte 3).
- Opcional e pequeno (tamanho P, ~0,5 h): `set_my_time_zone(p_time_zone)` para a tela mandar o fuso do navegador. Hoje a tela usa o fuso do navegador na semana, então se o fuso do membro for outro os números do resumo e os da semana podem divergir de dia. Ver P2.

## Parte 2: a função de resumo (tamanho G, ~4 h com testes)

`summarize_daily_usage(p_login text, p_from date, p_to date, p_now timestamptz default now()) returns integer` (devolve as linhas gravadas). Não é chamada pelo painel; `revoke ... from public, anon, authenticated`.

Passo a passo (mesma estrutura de `week_tokens_of`, com estas diferenças):

1. **Eventos considerados:** do dev, com hora `occurred_at` se existir, senão `created_at`. Lê todos os eventos guardados do dev (não só o intervalo) para ter a base certa do primeiro `Stop` do intervalo, e depois filtra os dias.
2. **Conversa principal, por modelo.** Para cada `Stop` com tokens, expandir `tokens_by_model` e tirar a diferença para o `Stop` anterior da mesma sessão e do mesmo modelo, `greatest(0, ...)`.
   - Primeiro `Stop` da sessão: conta inteiro só se o início está guardado (mesma regra da semana).
   - Modelo que aparece agora e não estava antes: conta inteiro (ele ainda não tinha sido usado).
   - **Ponto de transição:** se o `Stop` anterior não tem `tokens_by_model` (evento antigo) e o atual tem, não dá para saber o modelo do que veio antes. A diferença **total** (das colunas de tokens, igual à semana) vai inteira para `'desconhecido'`. Assim o total do dia continua igual ao da semana.
   - `Stop` sem `tokens_by_model`: a diferença total vai para `'desconhecido'`.
3. **Agentes:** cada `SubagentStop` soma inteiro, no dia em que terminou, rótulo por D5, modelo de `tokens_by_model` (se vier mais de um modelo, uma linha para cada) ou `'desconhecido'`.
4. **`calls`:** hoje o evento não traz o número de respostas. Proposta: contar **um por `Stop` e um por `SubagentStop`** (ou seja, "turnos", não chamadas à API). Para chamadas de verdade, o outro agente teria de mandar a contagem de `message.id` distintos no hook. Ver P3.
5. **`duration_ms`:** proposta (precisa de OK, P4):
   - Conversa principal: soma, por `prompt_id`, de (hora do `Stop` − hora do `UserPromptSubmit`) = tempo em que o Claude esteve trabalhando num pedido.
   - Agente: hora do `SubagentStop` − hora do `SubagentStart` (pelo `agent_id`).
   - A duração fica na linha do modelo com mais tokens de saída daquele dia/sessão/rótulo (a chave tem modelo, mas o tempo não); sem tokens, em `'desconhecido'`.
   - Alternativa mais simples e menos fiel: somar o `duration_ms` das ações (`PostToolUse`). Mede só o tempo de ferramenta.
6. **Gravação idempotente:** `insert ... on conflict (pk) do update set ... = excluded.*, updated_at = now()`. Antes, na mesma transação, apagar do intervalo as linhas `source = 'events'` que não vão mais existir (assim rodar duas vezes dá o mesmo resultado, mesmo se um evento atrasado mudou o dia). Nunca tocar em linhas `source = 'local'`, e pular dia que tenha qualquer linha `local` (D8).
7. **Só dia fechado:** o dia só entra se o fim dele no fuso do dev (`dia + 1` à meia-noite local) é anterior a `p_now`. Hoje nunca é resumido.

Orquestradora `summarize_closed_days(p_now)`:

- Para cada membro: `p_to = (p_now no fuso do membro)::date - 1`; `p_from = coalesce(summarized_through - 1, primeiro dia com evento)`, limitado a no máximo 5 dias atrás do dia local de hoje. Reprocessa os 2 últimos dias para pegar evento atrasado, mas **nunca um dia cujos eventos-base já possam ter sido apagados** (a limpeza guarda 7 dias; sem esse limite, reprocessar um dia velho gravaria números errados por cima dos certos).
- Cada membro roda dentro de um bloco `begin ... exception when others then raise warning ...`: erro (fuso inválido, por exemplo) em um dev não impede os outros e **não avança a marca d'água dele**.
- Ao terminar sem erro: `summarized_through = p_to`.

## Parte 3: agendamento e limpeza (tamanho M, ~1,5 h)

1. Ativar `pg_cron` (Dashboard → Database → Extensions; a migration também faz `create extension if not exists pg_cron`).
2. `prune_events(p_now)`: por membro, apaga eventos com `created_at < p_now - 7 dias` **e** `created_at < início do dia seguinte à marca d'água` (no fuso do membro). Membro sem marca d'água (nunca resumido): não apaga nada. Eventos de login que não é membro: seguem a regra antiga (mais de 7 dias).
3. `daily_maintenance()` = `summarize_closed_days(now())` e depois `prune_events(now())`.
4. Agenda: `select cron.schedule('resumo-diario-e-limpeza', '0 6 * * *', 'select daily_maintenance()')` e `cron.unschedule('limpa-eventos')` se existir. O `cleanup.sql` passa a só chamar isso (ou vira comentário apontando para a migration).
5. **Ordem de entrada em produção (importante):** (a) rodar a 007; (b) fazer o preenchimento do passado (Parte 4) e rodar `summarize_closed_days` à mão para os dias já fechados; (c) conferir a marca d'água de cada membro; (d) só então agendar o cron. Assim a primeira limpeza não apaga o que ainda não foi resumido.
6. Garantias de "nunca apagar dia não resumido": só apaga abaixo da marca d'água; a marca d'água só avança sem erro; o resumo e a limpeza são o mesmo job, nessa ordem.

## Parte 4: preenchimento do passado

### 4a. Com os eventos já no banco (tamanho P, ~1 h)

Dá: chamar `summarize_daily_usage(login, '2026-11-12', ontem)` para cada membro. Os totais por dia ficam corretos (mesma regra da semana).

Não dá:
- Modelo: eventos antigos não têm `tokens_by_model`, então tudo cai em `'desconhecido'`.
- Hora real: sem `occurred_at`, vale `created_at` (hora de chegada). Evento que ficou na fila do hook offline cai no dia errado.
- Duração: sem `duration_ms` e `prompt_id`, fica 0.
- `calls` é só a contagem de `Stop`/`SubagentStop`.
- Tudo o que acontece antes de 12/11 não está no banco.

Conclusão: serve para ter os dias 12 e 13 e como conferência, mas o histórico bom vem de 4b.

### 4b. Com os registros locais em `~/.claude/projects` (tamanho G, ~4 h)

Medido nesta máquina: 251 arquivos `.jsonl`, de 23/10 a hoje. Cada resposta do assistente tem `timestamp` (UTC), `sessionId`, `message.id`, `message.model` e `message.usage` (as quatro contagens). Agentes ficam em `<sessionId>/subagents/agent-*.jsonl`, com `agent-*.meta.json` trazendo `agentType`.

Viabilidade: boa. É a fonte **mais precisa**, porque tem modelo e hora real por resposta, e também conta `calls` de verdade (respostas distintas).

Como casar com `session_id`: o nome do arquivo (ou o campo `sessionId`) é o mesmo `session_id` que o hook envia. O agente herda o `session_id` da sessão que o chamou (pasta pai do arquivo).

Roteiro de um script `scripts/backfill-local-usage.ts` (roda na máquina do dev, só lê):
1. Percorrer os `.jsonl`, só linhas `type = "assistant"`; ignorar modelo `<synthetic>`.
2. Remover repetição por `message.id` **no conjunto todo** (não só por arquivo), mantendo a primeira ocorrência: uma retomada pode copiar o histórico em outro arquivo e dobrar o número. Medir quantas repetições existem antes de confiar.
3. Dia = `timestamp` convertido para o fuso do membro.
4. Rótulo: arquivo principal = `'principal'`; agente = `agentType` do `.meta.json` (**nunca** a `description`, que tem texto de tarefa).
5. Somar por (dia, sessão, rótulo, modelo): quatro contagens, `calls` = respostas distintas, `duration_ms` = por pedido, da mensagem do usuário até a última resposta antes do próximo pedido (aproximado).
6. Enviar só essas linhas agregadas para uma função nova `import_daily_usage(p_key uuid, p_rows jsonb)`, que usa a mesma chave de ingestão do hook (mesma segurança de `ingest`), grava com `source = 'local'` e é idempotente (`on conflict do update`). O script tem `--dry-run` que só imprime os totais por dia.
7. Conferência obrigatória antes de gravar: nos dias 12 e 13/11 comparar o total local com o resumo por eventos. Esperado: local **maior ou igual** (ele não perde o trecho após `/clear` ou compactação nem o primeiro `Stop` de sessão retomada, que a regra da semana descarta de propósito). Diferença para menos ou muito grande = bug a investigar.

Riscos:
- **Privacidade:** o arquivo de conversa tem o texto inteiro. O script nunca lê nem envia conteúdo: só os campos numéricos, `sessionId`, `model` e `agentType`. O envio é um JSON só com números e esses três rótulos, e o `--dry-run` mostra exatamente o que sairia. Teste de unidade garante que nenhuma outra chave sai.
- **Várias máquinas:** só enxerga esta máquina. Sessões em outro computador, na nuvem ou de outro dev ficam de fora; cada dev teria de rodar na sua. O banco não guarda de qual máquina veio (sem coluna para isso); a chave de `session_id` evita colisão na prática.
- **Prazo dos arquivos:** o Claude Code apaga conversas antigas (padrão de 30 dias, `cleanupPeriodDays`, não configurado aqui). Rodar logo: o começo (23/10) pode sumir em breve.
- **Não bate exatamente com o hook** (ver passo 7). Documentar na tela como "histórico reconstruído" se aparecer lá (usando a coluna `source`).
- **Mistura de fonte no mesmo dia:** coberta por D8.
- Fuso do passado: usa o fuso atual do membro (São Paulo), já que não há histórico de fuso.

## Parte 5: testes

### SQL: `supabase/tests/007_daily_usage.sql` (tamanho M, ~2 h)

Mesmo formato do `003_week_tokens.sql`: tudo numa transação que termina em `rollback`, falha com "esperado X, veio Y", termina com `OK`. Casos (um por comportamento):

1. **Equivalência com a semana:** o cenário A/B/C/agente do teste 003, sem `tokens_by_model`: a soma por dia de `daily_usage` (todos os modelos) é igual a `week_tokens_of`, em São Paulo e em UTC.
2. **Idempotência:** rodar duas vezes seguidas dá as mesmas linhas e a mesma contagem.
3. **Dia reprocessado após evento atrasado:** o número do dia muda e não sobra linha antiga.
4. **Por modelo:** dois modelos na mesma sessão somam cada um a sua diferença; troca de modelo no meio.
5. **Queda (compactação):** o acumulado cai, o gasto nunca é negativo, por modelo.
6. **Retomada:** primeiro `Stop` de sessão `resume` só vira base.
7. **Transição:** `Stop` anterior sem mapa e atual com mapa: a diferença total vai para `'desconhecido'` e o total do dia continua igual à semana.
8. **Sem `tokens_by_model`:** tudo em `'desconhecido'`.
9. **`occurred_at`:** vence `created_at` na escolha do dia e na ordem dos `Stop`; nulo usa `created_at`.
10. **Rótulos:** dois agentes do mesmo tipo viram uma linha; workflow vira `workflow: nome`; a conversa é `principal`.
11. **`calls` e `duration_ms`** conforme P3 e P4.
12. **RLS:** com `set local role authenticated` e `request.jwt.claims` de um dev, ele lê só as próprias linhas; outro login lê zero; `anon` lê zero e não consegue inserir, atualizar nem apagar.
13. **Só dia fechado:** o dia de hoje não é resumido; às 23:59 local o dia ainda é aberto, 00:01 do dia seguinte já fecha.
14. **Erro isolado:** membro com fuso inválido não impede o resumo de outro e a marca d'água dele não avança.
15. **Limpeza:** membro sem marca d'água não perde nada; evento com mais de 7 dias mas depois da marca d'água fica; evento antigo e coberto sai; evento recente fica.
16. **Fonte local:** dia com linha `local` é pulado pelo resumo por eventos; linhas `local` nunca são apagadas por reprocessamento.

### Script local (Vitest, sem banco)

Um teste por regra: repetição por `message.id`, `<synthetic>` ignorado, dia no fuso (hora de 02:00 UTC cai no dia anterior em São Paulo), rótulo do agente só com `agentType`, e **nenhuma chave de texto no JSON enviado**.

## Riscos gerais

- **Dependência do outro agente:** o formato de `tokens_by_model` é suposto como `{ "<modelo>": { "input_tokens", "output_tokens", "cache_creation_tokens", "cache_read_tokens" } }`, acumulado no `Stop` e total do agente no `SubagentStop`. Precisa ser confirmado com quem está fazendo a coluna e o hook; se for diferente, só muda a expansão do passo 2.
- **Semana e dia podem divergir** se a semana continuar usando `created_at` e o resumo usar `occurred_at`. Sugestão: trocar a semana depois para a mesma hora (`coalesce`), em outra tarefa.
- **Cron:** o job pode falhar em silêncio. Mitigação: marca d'água não avança; consulta simples `members.summarized_through` mostra atraso; se passar de 3 dias, avisar o dono.
- **Plano gratuito (500 MB):** o resumo cresce pouco (dezenas a centenas de linhas por dev por dia); se o resumo parar, os eventos não são apagados e o banco cresce. Acompanhar.
- **Limite de 1000 linhas por consulta** (`max-rows` do Supabase): a tela que ler `daily_usage` precisa paginar ou agregar por consulta.
- **Sessão que atravessa mais de 7 dias:** como na semana, quando o início foi apagado, o primeiro `Stop` do trecho só vira base.

## Tamanho de cada parte

| Parte | Tamanho | Estimativa |
|---|---|---|
| 1. Tabela, RLS, fuso e marca d'água (+ `set_my_time_zone`, opcional) | P | 0,5 h (+0,5 h) |
| 2. Função de resumo e orquestradora | G | 4 h |
| 3. Cron e limpeza segura | M | 1,5 h |
| 4a. Preenchimento por eventos + conferência | P | 1 h |
| 4b. Script local + `import_daily_usage` | G | 4 h |
| 5. Testes SQL (parte 2 e 3 já incluem os casos 1 a 16) | M | 2 h |
| **Total** | | **cerca de 13 h** |

Ordem sugerida: 1, 2 com testes, 4a (conferir), 3 sem agendar, 4b, depois agendar o cron.

## Perguntas ao dono

1. **P1.** Posso acrescentar `source` e `updated_at` à tabela (além das colunas que você listou)? Sem `source` não dá para o local e os eventos conviverem sem somar duas vezes.
2. **P2.** O fuso do dev vem de onde: padrão São Paulo para todos ou a tela envia o fuso do navegador (`set_my_time_zone`)? Se a tela da semana usa o navegador, o dia pode divergir do resumo.
3. **P3.** `calls` pode ser "turnos" (um por `Stop`/`SubagentStop`) nos dados novos e "respostas" no histórico local? Ou pedimos ao outro agente que o hook envie a contagem real?
4. **P4.** `duration_ms` = tempo trabalhando por pedido e por agente (início até fim), ou soma do tempo das ferramentas?
5. **P5.** Cron às 03:00 de São Paulo (`0 6 * * *` em UTC) está bom?
6. **P6.** Confirmar o formato de `tokens_by_model` com o outro agente (a 006 dele deve sair antes da 007, ou as duas com `add column if not exists`).
7. **P7.** Rodar o histórico local só para você agora (os arquivos de 30 dias somem) e pedir aos outros devs depois?
