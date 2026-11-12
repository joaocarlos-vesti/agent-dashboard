const MINUTE_MS = 60 * 1000;
const DAY_NAMES = { 0: 'hoje', 1: 'ontem' };
const formatterByZone = new Map();

function partsFormatter(timeZone) {
  if (!formatterByZone.has(timeZone)) {
    formatterByZone.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return formatterByZone.get(timeZone);
}

/** Partes do instante no fuso informado, como números (mês de 1 a 12, hora de 0 a 23). */
export function localParts(instant, timeZone) {
  const parts = Object.fromEntries(partsFormatter(timeZone).formatToParts(new Date(instant)).map(({ type, value }) => [type, Number(value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

const pad = (amount) => String(amount).padStart(2, '0');
const dayKey = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;
const dayStartUtcMs = (day) => Date.parse(`${day}T00:00:00Z`);

/** Dia (AAAA-MM-DD) do instante no fuso informado. */
export const localDay = (instant, timeZone) => dayKey(localParts(instant, timeZone));

/** Horário local do instante, como HH:MM. */
export function clockTime(instant, timeZone) {
  const { hour, minute } = localParts(instant, timeZone);
  return `${pad(hour)}:${pad(minute)}`;
}

export const addDays = (day, amount) => new Date(dayStartUtcMs(day) + amount * 24 * 60 * MINUTE_MS).toISOString().slice(0, 10);
export const daysBetween = (fromDay, toDay) => Math.round((dayStartUtcMs(toDay) - dayStartUtcMs(fromDay)) / (24 * 60 * MINUTE_MS));

function offsetMs(instant, timeZone) {
  const { year, month, day, hour, minute, second } = localParts(instant, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(instant / 1000) * 1000;
}

function startOfLocalDayMs(day, timeZone) {
  const asIfUtc = dayStartUtcMs(day);
  const firstGuess = asIfUtc - offsetMs(asIfUtc, timeZone);
  return asIfUtc - offsetMs(firstGuess, timeZone);
}

/** Intervalo [from, to) do dia local, em UTC. */
export const dayBounds = (day, timeZone) => ({
  from: new Date(startOfLocalDayMs(day, timeZone)).toISOString(),
  to: new Date(startOfLocalDayMs(addDays(day, 1), timeZone)).toISOString(),
});

const SELECTABLE_DAYS = 7;

function dayLabel(day, offset) {
  if (offset === 0) return 'Hoje';
  if (offset === 1) return 'Ontem';
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(dayStartUtcMs(day)).replace('.', '');
  return `${weekday} ${Number(day.slice(8))}`;
}

/** Os 7 dias do seletor, de hoje para trás (os eventos mais antigos são apagados). */
export function dayOptions(now, timeZone) {
  const today = localDay(now, timeZone);
  return Array.from({ length: SELECTABLE_DAYS }, (_, offset) => {
    const day = addDays(today, -offset);
    return { day, label: dayLabel(day, offset) };
  });
}

/** O "agora" do mapa: fim do dia numa vista passada, última atualização com o painel caído, senão o relógio. */
export function effectiveNow({ now, day, timeZone, connected = true, lastUpdateAt }) {
  if (day < localDay(now, timeZone)) return Date.parse(dayBounds(day, timeZone).to) - 1;
  return !connected && lastUpdateAt != null ? lastUpdateAt : now;
}

const dayName = (day, today) => {
  const daysAgo = daysBetween(day, today);
  return DAY_NAMES[daysAgo] ?? null;
};

export function startedLabel(startedAt, today, timeZone) {
  const daysAgo = daysBetween(localDay(startedAt, timeZone), today);
  const when = daysAgo === 1 ? 'ontem às' : `há ${daysAgo} dias, às`;
  return `começou ${when} ${clockTime(startedAt, timeZone)}`;
}

export function continuationLabel(nextActivityAt, today, timeZone) {
  const day = localDay(nextActivityAt, timeZone);
  const name = dayName(day, today);
  return name ? `continua ${name}` : `continua em ${day.slice(8)}/${day.slice(5, 7)}`;
}

export const resumedLabel = (resumedAt, timeZone) => `retomada às ${clockTime(resumedAt, timeZone)}`;
