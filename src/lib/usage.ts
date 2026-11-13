import { localDay } from './day';
import type { AgentEvent, CallGroup, SessionTokens, Tokens } from './types';

const toCount = (count: number | null | undefined) => Number(count ?? 0);

export const emptyTokens = (): Tokens => ({ input: 0, output: 0, cacheCreation: 0, cacheRead: 0, primary: 0 });

/** Tokens gravados num evento (SubagentStop ou Stop); null quando o evento não traz o uso. */
export function tokensOfEvent(event: AgentEvent): Tokens | null {
  if (event.input_tokens == null) return null;
  const input = toCount(event.input_tokens);
  const output = toCount(event.output_tokens);
  return { input, output, cacheCreation: toCount(event.cache_creation_tokens), cacheRead: toCount(event.cache_read_tokens), primary: input + output };
}

export function addTokens(tokensList: (Tokens | null | undefined)[]): Tokens {
  return tokensList.reduce<Tokens>(
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
export function rejectionExcerpt(result: string | null | undefined): string | null {
  return result && REJECTION_VERDICT.test(result) ? result.slice(0, REJECTION_EXCERPT_LENGTH) : null;
}

export function medianOf(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upperMiddle = sorted[middle] ?? 0;
  return sorted.length % 2 ? upperMiddle : ((sorted[middle - 1] ?? 0) + upperMiddle) / 2;
}

/** Marca as chamadas com mais que o dobro da mediana; só vale com 3 chamadas ou mais. */
export function outlierFlags(callTokens: number[]): boolean[] {
  const median = medianOf(callTokens);
  if (callTokens.length < OUTLIER_MIN_CALLS || median === null) return callTokens.map(() => false);
  return callTokens.map((amount) => amount > median * OUTLIER_FACTOR);
}

interface CallLike {
  id: string;
  result?: string | null;
  tokens: Tokens | null;
}

/** Resume várias chamadas: quantas foram, tokens somados, parte da sessão (0 a 1), reprovações e chamadas fora da curva. */
export function summarizeCalls<TCall extends CallLike>(agents: TCall[], sessionPrimaryTokens: number): CallGroup<TCall> {
  const tokens = addTokens(agents.map((agent) => agent.tokens));
  const measuredCalls = agents.filter((agent) => agent.tokens !== null);
  const measuredTokens = measuredCalls.map((agent) => agent.tokens?.primary ?? 0);
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

// Acumulado que cai (conversa compactada ou limpa): a queda não gasta nada, e a base recomeça no valor novo.
function growthSince(previous: Tokens, current: Tokens): Tokens {
  const input = Math.max(0, current.input - previous.input);
  const output = Math.max(0, current.output - previous.output);
  return {
    input,
    output,
    cacheCreation: Math.max(0, current.cacheCreation - previous.cacheCreation),
    cacheRead: Math.max(0, current.cacheRead - previous.cacheRead),
    primary: input + output,
  };
}

/**
 * Tokens da conversa de uma sessão, dia a dia. O Stop traz o acumulado; o gasto é a diferença entre Stops.
 * Sem o início da sessão guardado, o primeiro Stop é só a base e não entra em nenhum dia.
 */
function conversationUsage(
  sessionEvents: AgentEvent[],
  { timeZone, startMissing }: { timeZone: string | undefined; startMissing: boolean },
): { total: Tokens; byDay: Record<string, Tokens> } {
  const stopTokens = sessionEvents
    .filter((event) => event.event === 'Stop')
    .flatMap((event) => {
      const tokens = tokensOfEvent(event);
      return tokens ? [{ at: event.created_at, tokens }] : [];
    });
  const [firstStop, ...laterStops] = stopTokens;
  const baseline = startMissing && firstStop ? firstStop.tokens : emptyTokens();
  const byDay: Record<string, Tokens> = {};
  let previous = baseline;
  for (const stop of startMissing ? laterStops : stopTokens) {
    const day = localDay(Date.parse(stop.at), timeZone);
    byDay[day] = addTokens([byDay[day], growthSince(previous, stop.tokens)]);
    previous = stop.tokens;
  }
  return { total: addTokens([baseline, ...Object.values(byDay)]), byDay };
}

/** Tokens de uma sessão: conversa, agentes e total por dia. Cada agente conta no dia em que terminou. */
export function sessionTokens(
  sessionEvents: AgentEvent[],
  { timeZone, startMissing }: { timeZone: string | undefined; startMissing: boolean },
): Omit<SessionTokens, 'day'> {
  const conversation = conversationUsage(sessionEvents, { timeZone, startMissing });
  const byDay = { ...conversation.byDay };
  const agentStops = sessionEvents
    .filter((event) => event.event === 'SubagentStop')
    .flatMap((event) => {
      const tokens = tokensOfEvent(event);
      return tokens ? [{ at: event.created_at, tokens }] : [];
    });
  for (const stop of agentStops) {
    const day = localDay(Date.parse(stop.at), timeZone);
    byDay[day] = addTokens([byDay[day], stop.tokens]);
  }
  const agents = addTokens(agentStops.map((stop) => stop.tokens));
  return { conversation: conversation.total, agents, total: addTokens([conversation.total, agents]), byDay };
}

/** Soma os tokens de cada dia em valores absolutos (nunca em percentual), sem contar a mesma sessão duas vezes. */
export function weekTokens(
  sessions: { tokens: { byDay: Partial<Record<string, Tokens>> } }[],
  days: string[],
): { days: { day: string; tokens: Tokens }[]; total: Tokens } {
  const daily = days.map((day) => ({ day, tokens: addTokens(sessions.map((session) => session.tokens.byDay[day])) }));
  return { days: daily, total: addTokens(daily.map(({ tokens }) => tokens)) };
}
