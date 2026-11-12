import { localDay } from './day.js';

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

const REJECTION_EXCERPT_LENGTH = 160;
const OUTLIER_MIN_CALLS = 3;
const OUTLIER_FACTOR = 2;
const REJECTION_VERDICT = /(?<!\b(?:nenhum|nenhuma|sem|não|nao)\s)\bREPROVADO\b/;

/** Trecho do resultado de um agente que reprovou; null quando o resultado não reprova (inclui "nenhum REPROVADO"). */
export function rejectionExcerpt(result) {
  return REJECTION_VERDICT.test(result ?? '') ? result.slice(0, REJECTION_EXCERPT_LENGTH) : null;
}

export function medianOf(numbers) {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Marca as chamadas com mais que o dobro da mediana; só vale com 3 chamadas ou mais. */
export function outlierFlags(callTokens) {
  if (callTokens.length < OUTLIER_MIN_CALLS) return callTokens.map(() => false);
  const limit = medianOf(callTokens) * OUTLIER_FACTOR;
  return callTokens.map((amount) => amount > limit);
}

/** Resume várias chamadas: quantas foram, tokens somados, parte da sessão (0 a 1), reprovações e chamadas fora da curva. */
export function summarizeCalls(agents, sessionPrimaryTokens) {
  const tokens = addTokens(agents.map((agent) => agent.tokens));
  const measuredCalls = agents.filter((agent) => agent.tokens);
  const measuredTokens = measuredCalls.map((agent) => agent.tokens.primary);
  const flags = outlierFlags(measuredTokens);
  return {
    callCount: agents.length,
    agents,
    tokens,
    sessionShare: sessionPrimaryTokens > 0 ? tokens.primary / sessionPrimaryTokens : null,
    rejectedCount: agents.filter((agent) => rejectionExcerpt(agent.result)).length,
    medianPrimary: medianOf(measuredTokens),
    outlierAgentIds: measuredCalls.filter((_, index) => flags[index]).map((agent) => agent.id),
  };
}

const USAGE_FIELDS = ['input', 'output', 'cacheCreation', 'cacheRead'];

// Acumulado que cai (conversa compactada ou limpa) recomeça do zero: o que veio depois é gasto novo.
function growthSince(previous, current) {
  const grown = Object.fromEntries(USAGE_FIELDS.map((field) => [field, current[field] >= previous[field] ? current[field] - previous[field] : current[field]]));
  return { ...grown, primary: grown.input + grown.output };
}

/**
 * Tokens da conversa de uma sessão, dia a dia. O Stop traz o acumulado; o gasto é a diferença entre Stops.
 * Sem o início da sessão guardado, o primeiro Stop é só a base e não entra em nenhum dia.
 */
export function conversationUsage(sessionEvents, { timeZone, startMissing }) {
  const stops = sessionEvents.filter((event) => event.event === 'Stop' && tokensOfEvent(event));
  const baseline = startMissing && stops.length ? tokensOfEvent(stops[0]) : emptyTokens();
  const byDay = {};
  let previous = baseline;
  for (const stop of startMissing ? stops.slice(1) : stops) {
    const current = tokensOfEvent(stop);
    const day = localDay(Date.parse(stop.created_at), timeZone);
    byDay[day] = addTokens([byDay[day], growthSince(previous, current)]);
    previous = current;
  }
  return { total: addTokens([baseline, ...Object.values(byDay)]), byDay };
}

/** Soma os tokens de cada dia em valores absolutos (nunca em percentual), sem contar a mesma sessão duas vezes. */
export function weekTokens(sessions, days) {
  const daily = days.map((day) => ({ day, tokens: addTokens(sessions.map((session) => session.tokens.byDay[day])) }));
  return { days: daily, total: addTokens(daily.map(({ tokens }) => tokens)) };
}
