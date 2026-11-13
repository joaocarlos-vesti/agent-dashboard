const MINUTE_MS = 60 * 1000;
const DAY_NAMES: Record<number, string> = { 0: 'hoje', 1: 'ontem' };
type Instant = number | string;
export interface LocalParts { year: number; month: number; day: number; hour: number; minute: number; second: number }

const formatterByZone = new Map<string | undefined, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const cached = formatterByZone.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  formatterByZone.set(timeZone, formatter);
  return formatter;
}

/** Partes do instante no fuso informado, como números (mês de 1 a 12, hora de 0 a 23). */
export function localParts(instant: Instant, timeZone: string | undefined): LocalParts {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant));
  const partOf = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: partOf('year'), month: partOf('month'), day: partOf('day'), hour: partOf('hour'), minute: partOf('minute'), second: partOf('second') };
}

const pad = (amount: number) => String(amount).padStart(2, '0');
const dayKey = ({ year, month, day }: LocalParts) => `${year}-${pad(month)}-${pad(day)}`;
const dayStartUtcMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** Dia (AAAA-MM-DD) do instante no fuso informado. */
export const localDay = (instant: Instant, timeZone: string | undefined) => dayKey(localParts(instant, timeZone));

/** Horário local do instante, como HH:MM. */
export function clockTime(instant: Instant, timeZone: string | undefined): string {
  const { hour, minute } = localParts(instant, timeZone);
  return `${pad(hour)}:${pad(minute)}`;
}

const addDays = (day: string, amount: number) => new Date(dayStartUtcMs(day) + amount * 24 * 60 * MINUTE_MS).toISOString().slice(0, 10);
const daysBetween = (fromDay: string, toDay: string) => Math.round((dayStartUtcMs(toDay) - dayStartUtcMs(fromDay)) / (24 * 60 * MINUTE_MS));

function offsetMs(instant: number, timeZone: string | undefined): number {
  const { year, month, day, hour, minute, second } = localParts(instant, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(instant / 1000) * 1000;
}

// Em dia que pula a meia-noite (horário de verão), o dia começa na primeira hora que existe.
function startOfLocalDayMs(day: string, timeZone: string | undefined): number {
  const asIfUtc = dayStartUtcMs(day);
  const firstGuess = asIfUtc - offsetMs(asIfUtc, timeZone);
  let start = asIfUtc - offsetMs(firstGuess, timeZone);
  while (localDay(start, timeZone) < day) start += 15 * MINUTE_MS;
  return start;
}

/** Intervalo [from, to) do dia local, em UTC. */
export const dayBounds = (day: string, timeZone: string | undefined): { from: string; to: string } => ({
  from: new Date(startOfLocalDayMs(day, timeZone)).toISOString(),
  to: new Date(startOfLocalDayMs(addDays(day, 1), timeZone)).toISOString(),
});

const SELECTABLE_DAYS = 7;

function dayLabel(day: string, offset: number): string {
  if (offset === 0) return 'Hoje';
  if (offset === 1) return 'Ontem';
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(dayStartUtcMs(day)).replace('.', '');
  return `${weekday} ${Number(day.slice(8))}`;
}

/** Os 7 dias do seletor, de hoje para trás (os eventos mais antigos são apagados). */
export function dayOptions(now: number, timeZone: string | undefined): { day: string; label: string }[] {
  const today = localDay(now, timeZone);
  return Array.from({ length: SELECTABLE_DAYS }, (_, offset) => {
    const day = addDays(today, -offset);
    return { day, label: dayLabel(day, offset) };
  });
}

/** O "agora" do mapa: fim do dia numa vista passada, última atualização com o painel caído, senão o relógio. */
export function effectiveNow({ now, day, timeZone, connected = true, lastUpdateAt }: {
  now: number;
  day: string;
  timeZone: string | undefined;
  connected?: boolean;
  lastUpdateAt?: number;
}): number {
  if (day < localDay(now, timeZone)) return Date.parse(dayBounds(day, timeZone).to) - 1;
  return !connected && lastUpdateAt != null ? lastUpdateAt : now;
}

const dayName = (day: string, today: string): string | null => {
  const daysAgo = daysBetween(day, today);
  return DAY_NAMES[daysAgo] ?? null;
};

export function startedLabel(startedAt: Instant, today: string, timeZone: string | undefined): string {
  const daysAgo = daysBetween(localDay(startedAt, timeZone), today);
  const when = daysAgo === 1 ? 'ontem às' : `há ${daysAgo} dias, às`;
  return `começou ${when} ${clockTime(startedAt, timeZone)}`;
}

export function continuationLabel(nextActivityAt: Instant, today: string, timeZone: string | undefined): string {
  const day = localDay(nextActivityAt, timeZone);
  const name = dayName(day, today);
  return name ? `continua ${name}` : `continua em ${day.slice(8)}/${day.slice(5, 7)}`;
}

export const resumedLabel = (resumedAt: Instant, timeZone: string | undefined) => `retomada às ${clockTime(resumedAt, timeZone)}`;
