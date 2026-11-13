import { localParts } from './day';
import type { Session, Tokens } from './types';

const UNITS = [
  { from: 1e3, label: 'mil' },
  { from: 1e6, label: 'mi' },
  { from: 1e9, label: 'bi' },
];
const roundToThreeDigits = (amount: number) => Number(amount.toPrecision(3));
const formatAmount = (amount: number) => amount.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * Formata uma contagem de tokens no formato curto em português, com até 3 algarismos significativos.
 * @example formatTokens(12400) // "12,4 mil"
 * @example formatTokens(1200000) // "1,2 mi"
 * @example formatTokens(null) // "—"
 */
export function formatTokens(count: number | null | undefined): string {
  if (count == null) return '—';
  const [smallestUnit] = UNITS;
  if (!smallestUnit || count < smallestUnit.from) return formatAmount(count);
  let unitIndex = UNITS.findLastIndex((unit) => count >= unit.from);
  let unit = UNITS[unitIndex] ?? smallestUnit;
  let scaled = roundToThreeDigits(count / unit.from);
  const largerUnit = UNITS[unitIndex + 1];
  if (scaled >= 1000 && largerUnit) {
    unit = largerUnit;
    scaled = roundToThreeDigits(count / unit.from);
  }
  return `${formatAmount(scaled)} ${unit.label}`;
}

export const pageTitle = (waitingSessionCount: number) =>
  waitingSessionCount > 0 ? `(${waitingSessionCount}) Painel de agentes` : 'Painel de agentes';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Tempo decorrido em português curto.
 * @example formatRelativeTime(agoraMenos40s, agora) // "agora"
 * @example formatRelativeTime(agoraMenos3min, agora) // "há 3 min"
 * @example formatRelativeTime(agoraMenos2h10, agora) // "há 2 h"
 */
export function formatRelativeTime(instant: string, now: number): string {
  const elapsedMs = Math.max(0, now - Date.parse(instant));
  if (elapsedMs < MINUTE_MS) return 'agora';
  if (elapsedMs < HOUR_MS) return `há ${Math.floor(elapsedMs / MINUTE_MS)} min`;
  if (elapsedMs < DAY_MS) return `há ${Math.floor(elapsedMs / HOUR_MS)} h`;
  const days = Math.floor(elapsedMs / DAY_MS);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/** Data e hora locais, para o texto que aparece ao passar o mouse. */
export function exactTime(instant: string, timeZone: string | undefined): string {
  const { day, month, hour, minute } = localParts(Date.parse(instant), timeZone);
  const pad = (amount: number) => String(amount).padStart(2, '0');
  return `${pad(day)}/${pad(month)} ${pad(hour)}:${pad(minute)}`;
}

const ACTION_VERBS: Record<string, string> = {
  Edit: 'editou', MultiEdit: 'editou', NotebookEdit: 'editou', Write: 'escreveu', Read: 'leu',
  Bash: 'rodou', Grep: 'buscou', Glob: 'listou', WebFetch: 'abriu', WebSearch: 'pesquisou',
};
const FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit', 'Write', 'Read']);

/** Última ação do agente como verbo, sem expor o nome da ferramenta. Ferramenta desconhecida fica como veio. */
export function describeAction({ tool, summary }: { tool?: string | null; summary?: string | null }): string | undefined {
  const verb = tool ? ACTION_VERBS[tool] : undefined;
  if (!tool || !verb) return tool ?? undefined;
  const target = FILE_TOOLS.has(tool) ? summary?.split('/').filter(Boolean).at(-1) : summary;
  return [verb, target].filter(Boolean).join(' ');
}

export const folderName = (cwd: string | null | undefined): string | null => cwd?.split(/[\\/]/).filter(Boolean).at(-1) ?? null;

/** Título e ponto do ícone da aba: o número só conta quem aguarda permissão; "sua vez" recente só põe o ponto. */
export function tabIndicator(sessions: (Pick<Session, 'status'> & { recent?: boolean })[]): { title: string; dot: boolean } {
  return {
    title: pageTitle(sessions.filter((session) => session.status === 'waiting').length),
    dot: sessions.some((session) => session.status === 'your_turn' && session.recent),
  };
}

const FAVICON_BASE = '<rect width="32" height="32" rx="8" fill="#d97757"/><path d="M9 21l5-5-5-5M17 22h7" stroke="#141416" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
const FAVICON_DOT = '<circle cx="25" cy="7" r="6" fill="#ffffff" stroke="#141416" stroke-width="2"/>';

/** Ícone da aba como endereço de imagem; o ponto avisa que uma sessão acabou de ficar na sua vez. */
export const faviconHref = (dot: boolean): string =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${FAVICON_BASE}${dot ? FAVICON_DOT : ''}</svg>`)}`;

export const describeSessionTokens = ({ day, total }: { day: Pick<Tokens, 'primary'>; total: Pick<Tokens, 'primary'> }): string => `hoje: ${formatTokens(day.primary)} · sessão inteira: ${formatTokens(total.primary)}`;
