# Prompt para o Claude Design — Painel de agentes (v1)

## 1. Contexto e objetivo
Desenhe a v1 do **Painel de agentes**: uma página web que um desenvolvedor deixa aberta numa aba ou no segundo monitor para acompanhar, ao vivo, as **próprias** sessões do Claude Code. A estrutura é: sessões → workflows (vários subagentes orquestrados) → agentes → ações, com o consumo de tokens em cada nível.

- É **individual**: cada dev vê só o que é dele. Não é ferramenta de gestão nem compara pessoas.
- Só **observa**: não para, não responde e não controla nada.

**Critério de sucesso:** quem olha pensa "isso ajuda muito" e responde em **3 segundos** a duas perguntas: "alguém está me esperando?" e "algo deu errado?".

## 2. Usuário e situação de uso
- Um desenvolvedor que olha a tela de canto de olho enquanto trabalha em outra coisa.
- Costuma ter de 1 a 3 workflows ao mesmo tempo, com uns 5 agentes cada, além de agentes avulsos.
- As sessões rodam na máquina dele (locais) ou na nuvem, e as duas aparecem com o mesmo nível de detalhe, tokens inclusive.
- Quando a aba não está em foco, o único aviso é o **título da aba**: "(N) Painel de agentes", onde N é quantas sessões aguardam o dev. Não há notificação do sistema.

## 3. Hierarquia de atenção
Responda a estas perguntas, nesta ordem de importância:

| # | Pergunta | Tempo | O que responde |
|---|---|---|---|
| 1 | Alguém está me esperando? | 3 s | sessão aguardando o dev (pedido de permissão ou ociosa) |
| 2 | Algo deu errado ou parou? | 3 s | REPROVADO no resultado; tempo sem nova ação; sem sinal |
| 3 | Em que pé está cada workflow? | 30 s | agentes por estado, resultado de cada um, workflow concluído |
| 4 | O que esse agente está fazendo agora? | 30 s | tarefa e última ação, com há quanto tempo |
| 5 | Quanto isso está custando? | 30 s | tokens da sessão, dos agentes e da semana |

**Sob demanda** (ao expandir ou abrir o detalhe): tarefa completa, lista de ações, cada chamada, detalhe do cache, total da semana.

## 4. Telas e estados a desenhar
Desenhe cada item como tela ou estado nomeado, em **desktop e celular** (no celular, tudo empilhado em uma coluna).

1. **Login.**
2. **Conectar meu Claude Code:** um comando para copiar (botão "Copiar" com confirmação) e um bloco opcional, separado, para conectar sessões na nuvem.
3. **Painel**, nos estados:
   - a. Primeiro acesso, nada conectado (leva ao "Conectar meu Claude Code").
   - b. Conectado, nada rodando.
   - c. Rodando normal.
   - d. Alguém aguardando você (sobe para o topo, cor quente, título da aba com contagem).
   - e. Agente sem nova ação há mais de 10 min (mostrar o fato: "sem nova ação há 14 min").
   - f. Agente com resultado REPROVADO.
   - g. Sessão sem sinal.
   - h. Sessão encerrada.
   - i. Conexão do **painel** caída: aviso próprio, visualmente diferente de "sem sinal" de uma sessão, com o horário da última atualização.
4. **Detalhe de uma sessão:** agentes, chamadas de cada um e tokens (com o cache em segundo plano).
5. **Detalhe de um agente:** tarefa completa, lista de ações, cada chamada com seus tokens.
6. **Usuário sem acesso.**

Inclua também o destaque leve (~2 s) de uma mudança ao vivo, como uma nota de comportamento.

## 5. Regras de conteúdo e apresentação (obrigatórias)

### Estados
- Vocabulário fixo, só estas cinco palavras: **rodando, concluído, aguardando você, sem sinal, encerrada**.
- Estado sempre como **palavra + ícone**, nunca só cor.
- **Cor quente só no que pede ação do dev**, e só isso sobe para o topo, por regra fixa. Fora isso, a ordem não pula.
- **REPROVADO** e **"sem nova ação há X"** ganham um destaque **leve** (menos forte que "aguardando você") e **não sobem** para o topo. O alerta forte fica reservado para o que parou o trabalho.
- "Esperando permissão" e "ocioso" aparecem como **aguardando você**.
- **Fato, não veredito:** "sem nova ação há 14 min", nunca "travado" ou "falhou". REPROVADO é o resultado que o próprio agente devolveu e pode aparecer como tal.
- Uma ferramenta longa ainda em execução (build, teste) aparece como "rodando há X", não como parada.
- Nada pisca continuamente. Mudança ao vivo: destaque leve de ~2 s.
- O horário da última atualização fica sempre visível.

### Tokens
- **Número principal = entrada + saída.** O cache aparece em segundo plano, com **criação** e **leitura** separadas.
- Formato curto em português, no máximo 3 algarismos significativos: "12,4 mil", "1,2 mi". O valor exato só no detalhe.
- Uma única explicação, em linguagem simples, do que "tokens" significa, usada em todas as telas.
- **Linha de agente:** "N chamadas · total X · % da sessão · quantas reprovaram".
- **Linha de chamada (sob demanda):** número da chamada, tokens, % sobre o total daquele agente e duração.
- **Fora da curva:** destacar só a chamada acima de 2x a mediana, e só quando o agente tem 3 chamadas ou mais.
- **Semana:** total absoluto, discreto e sob demanda ("4,8 mi na semana"). **Nunca em percentual.**

### Agrupar e nomear agentes
- Agentes avulsos: agrupados pelo tipo (ex.: `logic-reviewer`).
- Agentes de workflow: cada linha tem um **rótulo curto deduzido da tarefa** ("revisar", "testar", "implementar" ou as primeiras palavras). O rótulo só identifica, não junta linhas.
- Chamadas somadas só quando o início da tarefa é idêntico, sempre com a marca **"provável mesmo agente"**.
- Nunca mostrar "fase" do workflow.

### Texto
- Tarefa longa: uma linha com reticências; texto completo ao expandir. Texto em inglês fica como veio.
- Pasta pelo nome final, não pelo caminho.
- Tempo relativo ("há 3 min"), com horário exato ao passar o mouse (no celular, ao tocar).
- Verbos de ação no lugar do nome da ferramenta: "editou spec.md", "rodou os testes", não "Edit" ou "Bash".
- Nenhum identificador técnico à vista (IDs de sessão, de execução, de agente).

## 6. Dados de exemplo (use estes, coerentes entre si)
Dev com 3 sessões; total da semana: **4,8 mi**.

**Sessão 1 — pasta `loja-web`, local, rodando, workflow "Revisão do checkout"** — total **400 mil** (entrada + saída); cache: leitura 3,1 mi, criação 210 mil.

| Agente (rótulo) | Estado | Chamadas | Total | % da sessão | Reprovaram |
|---|---|---|---|---|---|
| revisar lógica (provável mesmo agente) | rodando há 2 min | 7 | 184 mil | 46% | 2 |
| implementar | concluído | 2 | 96 mil | 24% | — |
| testar | rodando há 8 min ("rodando os testes") | 1 | 52 mil | 13% | — |
| revisar boas práticas | concluído | 1 | 36 mil | 9% | — |
| atualizar spec | concluído | 1 | 12 mil | 3% | — |
| sessão principal | — | — | 20 mil | 5% | — |

Chamadas do "revisar lógica": 18,2 · 21,0 · 19,5 · **64,8 (fora da curva; mediana 20,1)** · 20,1 · 17,6 · 22,8 mil = 184 mil. Chamadas 2 e 4 devolveram REPROVADO. Tarefa de exemplo: "Review the coupon discount logic in checkout and report blocking issues…". Última ação: "leu cart.ts há 40 s".

**Sessão 2 — pasta `api-pedidos`, nuvem, aguardando você há 6 min** (pedido de permissão para rodar um comando) — total **41,3 mil**. Um agente avulso `logic-reviewer`, 1 chamada.

**Sessão 3 — pasta `docs-internos`, local, encerrada há 2 h** — total **128 mil**, 3 agentes concluídos.

Para os estados e (sem nova ação) e g (sem sinal), varie um agente ou sessão destes exemplos.

## 7. O que NÃO desenhar
- % do limite do plano (5 h ou semanal) e qualquer gráfico, inclusive o semanal.
- Custo em dinheiro.
- Fase atual do workflow.
- Controles de ação: parar, responder, aprovar permissão.
- Comparação entre pessoas ou ranking de equipe.
- Comparação entre sessões antigas.
- Lista completa de ações em primeiro plano (basta a última) e texto completo de pedidos e resultados à vista (basta o veredito e um trecho).

## 8. Restrições técnicas
- Será implementado como página estática simples (HTML, CSS e JS), com atualização ao vivo. Evite efeitos que exijam bibliotecas pesadas.
- Tema escuro como padrão; mostre também como fica no claro, se fizer sentido.
- Acessibilidade: contraste AA, foco visível no teclado, nada que dependa só de cor.
- O layout é livre; as regras e os estados acima não são.

## 9. Entregáveis
- Todas as telas da seção 4, nomeadas pelo estado (ex.: "Painel — aguardando você", "Painel — conexão caída"), em desktop e celular.
- Componentes reutilizáveis, com suas variações: **selo de estado** (os 5 estados, + REPROVADO e "sem nova ação há X"), **linha de agente**, **linha de chamada** (normal e fora da curva), **bloco de tokens** (principal + cache em segundo plano + semana sob demanda), aviso de conexão do painel.
- Uma nota curta explicando a regra de ordenação e o uso de cor quente.
