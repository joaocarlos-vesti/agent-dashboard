import { dayBounds } from './day';
import { weekTokens } from './usage';
import type { AgentEvent, Tokens } from './types';

export const PAGE_SIZE = 1000;
export const SESSION_BATCH_SIZE = 50;

export interface PageRange { from: number; to: number }
export interface EventPage { data: AgentEvent[] | null; error: { message: string } | null }
/** Intervalo de `created_at` em UTC: `gte` inclusivo, `lt` exclusivo. */
export interface EventFilter { gte: string; lt: string }

/** O que o Supabase precisa responder; a montagem das consultas fica em funções puras que usam só isto. */
export interface EventSource {
  eventsInRange: (filter: EventFilter, range: PageRange) => PromiseLike<EventPage>;
  /** Eventos das sessões informadas que ficam fora do intervalo (antes ou depois dele). */
  eventsOfSessionsOutside: (sessionIds: string[], outside: EventFilter, range: PageRange) => PromiseLike<EventPage>;
}

/** Uma linha de `my_week_tokens`: tokens de um dia local, em valores absolutos. */
export interface WeekTokensRow {
  day: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

/** Filtros `gte`/`lt` do dia local em UTC. */
export const dayFilter = (day: string, timeZone: string | undefined): EventFilter => {
  const { from, to } = dayBounds(day, timeZone);
  return { gte: from, lt: to };
};

/** Pede página por página até vir uma incompleta; qualquer erro derruba a consulta toda, sem devolver dados pela metade. */
export async function fetchAllPages(fetchPage: (range: PageRange) => PromiseLike<EventPage>, pageSize = PAGE_SIZE): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await fetchPage({ from, to: from + pageSize - 1 });
    if (error) throw new Error(error.message);
    if (!page) throw new Error('A consulta não devolveu dados.');
    events.push(...page);
    if (page.length < pageSize) return events;
  }
}

const inBatches = <TItem>(items: TItem[], size: number): TItem[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const byCreatedAtThenId = (a: AgentEvent, b: AgentEvent) => Date.parse(a.created_at) - Date.parse(b.created_at) || (a.id ?? 0) - (b.id ?? 0);

/**
 * Eventos do dia local mais todo o resto das sessões que tiveram evento nele (início em dias anteriores, continuação nos seguintes),
 * para as marcas de vários dias e o "sessão inteira" ficarem certos.
 */
export async function loadDayEvents(source: EventSource, day: string, timeZone: string | undefined): Promise<AgentEvent[]> {
  const filter = dayFilter(day, timeZone);
  const dayEvents = await fetchAllPages((range) => source.eventsInRange(filter, range));
  const sessionIds = [...new Set(dayEvents.map((event) => event.session_id))];
  const otherDaysBatches = await Promise.all(
    inBatches(sessionIds, SESSION_BATCH_SIZE).map((batch) => fetchAllPages((range) => source.eventsOfSessionsOutside(batch, filter, range))),
  );
  return [...dayEvents, ...otherDaysBatches.flat()].sort(byCreatedAtThenId);
}

const toCount = (count: number | string | null | undefined) => Number(count ?? 0);

/** Linhas do banco (um valor por dia) no mesmo formato da semana calculada no navegador; dias sem linha valem zero. */
export function weekTokensFromRows(rows: WeekTokensRow[], days: string[]): { days: { day: string; tokens: Tokens }[]; total: Tokens } {
  const byDay: Partial<Record<string, Tokens>> = {};
  for (const row of rows) {
    const input = toCount(row.input_tokens);
    const output = toCount(row.output_tokens);
    byDay[row.day] = { input, output, cacheCreation: toCount(row.cache_creation_tokens), cacheRead: toCount(row.cache_read_tokens), primary: input + output };
  }
  return weekTokens([{ tokens: { byDay } }], days);
}
