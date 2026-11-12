const toCount = (count) => Number(count ?? 0);

export const emptyTokens = () => ({ input: 0, output: 0, cacheCreation: 0, cacheRead: 0, primary: 0 });

/** Tokens gravados num evento (SubagentStop ou Stop); null quando o evento não traz o uso. */
export function tokensOfEvent(event) {
  if (event.input_tokens == null) return null;
  const input = toCount(event.input_tokens);
  const output = toCount(event.output_tokens);
  return { input, output, cacheCreation: toCount(event.cache_creation_tokens), cacheRead: toCount(event.cache_read_tokens), primary: input + output };
}

export function addTokens(tokensList) {
  return tokensList.reduce(
    (sum, tokens) => (tokens
      ? {
          input: sum.input + tokens.input,
          output: sum.output + tokens.output,
          cacheCreation: sum.cacheCreation + tokens.cacheCreation,
          cacheRead: sum.cacheRead + tokens.cacheRead,
          primary: sum.primary + tokens.primary,
        }
      : sum),
    emptyTokens(),
  );
}

const isRejected = (agent) => Boolean(agent.result?.includes('REPROVADO'));

/** Resume várias chamadas: quantas foram, tokens somados, parte da sessão (0 a 1) e quantas reprovaram. */
export function summarizeCalls(agents, sessionPrimaryTokens) {
  const tokens = addTokens(agents.map((agent) => agent.tokens));
  return {
    callCount: agents.length,
    agents,
    tokens,
    sessionShare: sessionPrimaryTokens > 0 ? tokens.primary / sessionPrimaryTokens : null,
    rejectedCount: agents.filter(isRejected).length,
  };
}
