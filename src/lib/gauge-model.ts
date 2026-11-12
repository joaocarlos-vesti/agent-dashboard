import { gaugeSummary } from './activity';
import { dayOptions } from './day';
import { folderName, formatTokens } from './format';
import type { Session, Tokens } from './types';

export type WeekTokensState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; days: { day: string; tokens: Tokens }[]; total: Tokens };

export interface GaugeInput {
  sessions: Session[];
  now: number;
  pastDay: boolean;
  viewedDay: string;
  timeZone: string | undefined;
  week: WeekTokensState;
}

export interface GaugeFigure { value: string; label: string }
export interface WeekRow { day: string; label: string; tokensText: string; widthPct: number; selected: boolean }
export interface DaySessionRow { id: string; name: string; tokensText: string; ended: boolean }
export type WeekPanel =
  | { kind: 'loading'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'empty'; text: string }
  | { kind: 'ready'; totalText: string; rows: WeekRow[] };

export interface GaugeModel {
  figures: GaugeFigure[];
  week: WeekPanel;
  daySessionsTitle: string;
  daySessions: DaySessionRow[];
  daySessionsEmptyText: string | null;
}

export const HELP_TITLE = 'Como ler o mapa';
export const TOKENS_DEFINITION = 'Tokens: a medida de quanto o Claude leu e escreveu. O número grande soma entrada e saída; o cache (reler o que já foi enviado) aparece à parte.';

const LIVE_ONLY_PLACEHOLDER = '—';

function weekPanelOf({ week, viewedDay, now, timeZone }: GaugeInput): WeekPanel {
  if (week.status === 'loading') return { kind: 'loading', text: 'Carregando…' };
  if (week.status === 'error') return { kind: 'error', text: `Não foi possível carregar os últimos 7 dias: ${week.message}.` };
  if (week.total.primary === 0) return { kind: 'empty', text: 'Sem tokens nos últimos 7 dias.' };
  const labels = new Map(dayOptions(now, timeZone).map(({ day, label }) => [day, label]));
  const largest = Math.max(...week.days.map(({ tokens }) => tokens.primary));
  return {
    kind: 'ready',
    totalText: formatTokens(week.total.primary),
    rows: week.days.map(({ day, tokens }) => ({ day, label: labels.get(day) ?? day, tokensText: formatTokens(tokens.primary), widthPct: Math.round((tokens.primary / largest) * 1000) / 10, selected: day === viewedDay })),
  };
}

/** Os três números do mostrador, os 7 dias e a divisão do dia por sessão. */
export function gaugeModel(input: GaugeInput): GaugeModel {
  const { sessions, now, pastDay, viewedDay, timeZone } = input;
  const summary = gaugeSummary(sessions, now);
  const dayLabel = (dayOptions(now, timeZone).find(({ day }) => day === viewedDay)?.label ?? viewedDay).toLowerCase();
  const daySessions = sessions
    .map((session) => ({ id: session.id, name: folderName(session.cwd) ?? 'sessão', primary: session.tokens.day.primary, ended: session.status === 'ended' }))
    .sort((a, b) => b.primary - a.primary)
    .map(({ id, name, primary, ended }): DaySessionRow => ({ id, name, tokensText: formatTokens(primary), ended }));
  return {
    figures: [
      { value: pastDay ? LIVE_ONLY_PLACEHOLDER : String(summary.activeAgents), label: 'agindo' },
      { value: pastDay ? LIVE_ONLY_PLACEHOLDER : String(summary.actionsLastMinute), label: 'ações/min' },
      { value: formatTokens(summary.tokensToday), label: pastDay ? 'tokens neste dia' : 'tokens hoje' },
    ],
    week: weekPanelOf(input),
    daySessionsTitle: `Por sessão · ${dayLabel}`,
    daySessions,
    daySessionsEmptyText: daySessions.length === 0 ? 'Nenhuma sessão neste dia.' : null,
  };
}
