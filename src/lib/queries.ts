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
  openSessionIdsBefore: (before: string) => PromiseLike<OpenSessions>;
}

/** Uma linha de `my_week_tokens`: tokens de um dia local, em valores absolutos. */
/** Ids das sessões que ainda estavam abertas (sem SessionEnd) antes do instante pedido. */
export interface OpenSessions { data: string[] | null; error: { message: string } | null }
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

/** Expressão `or` do PostgREST para "antes do intervalo ou a partir do fim dele"; as horas vão entre aspas por causa dos `:`. */
export const outsideDayFilter = ({ gte, lt }: EventFilter): string => `created_at.lt."${gte}",created_at.gte."${lt}"`;

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
 * Eventos do dia local mais todo o resto das sessões que tiveram evento nele ou que vinham abertas (sem SessionEnd) de antes dele
 * (início em dias anteriores, continuação nos seguintes), para o estado, as marcas de vários dias e o "sessão inteira" ficarem certos.
 */
export async function loadDayEvents(source: EventSource, day: string, timeZone: string | undefined): Promise<AgentEvent[]> {
  const filter = dayFilter(day, timeZone);
  const [dayEvents, openSessions] = await Promise.all([
    fetchAllPages((range) => source.eventsInRange(filter, range)),
    source.openSessionIdsBefore(filter.gte),
  ]);
  if (openSessions.error) throw new Error(openSessions.error.message);
  const sessionIds = [...new Set([...dayEvents.map((event) => event.session_id), ...(openSessions.data ?? [])])];
  const otherDaysBatches = await Promise.all(
    inBatches(sessionIds, SESSION_BATCH_SIZE).map((batch) => fetchAllPages((range) => source.eventsOfSessionsOutside(batch, filter, range))),
  );
  return mergeEvents(dayEvents, otherDaysBatches.flat());
}

// "Fora do intervalo" com os dois limites no mesmo instante é tudo: antes dele ou a partir dele.
const NO_DAY_FILTER: EventFilter = { gte: '1970-01-01T00:00:00.000Z', lt: '1970-01-01T00:00:00.000Z' };

/** Todos os eventos guardados de uma sessão (para um evento ao vivo de sessão que a tela ainda não conhece). */
export const loadSessionEvents = (source: EventSource, sessionId: string): Promise<AgentEvent[]> =>
  fetchAllPages((range) => source.eventsOfSessionsOutside([sessionId], NO_DAY_FILTER, range)).then((events) => mergeEvents([], events));

/** Junta duas listas sem repetir o evento que veio pelas duas vias (pelo id) e na ordem do tempo. Evento sem id nunca é descartado. */
export function mergeEvents(current: AgentEvent[], incoming: AgentEvent[]): AgentEvent[] {
  const knownIds = new Set(current.flatMap((event) => (event.id === undefined ? [] : [event.id])));
  const newEvents = incoming.filter((event) => {
    if (event.id === undefined) return true;
    if (knownIds.has(event.id)) return false;
    knownIds.add(event.id);
    return true;
  });
  return [...current, ...newEvents].sort(byCreatedAtThenId);
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
