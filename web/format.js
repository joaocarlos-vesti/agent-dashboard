import { localParts } from './day.js';

const UNITS = [
  { from: 1e3, label: 'mil' },
  { from: 1e6, label: 'mi' },
  { from: 1e9, label: 'bi' },
];
const roundToThreeDigits = (amount) => Number(amount.toPrecision(3));
const formatAmount = (amount) => amount.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * Formata uma contagem de tokens no formato curto em português, com até 3 algarismos significativos.
 * @example formatTokens(12400) // "12,4 mil"
 * @example formatTokens(1200000) // "1,2 mi"
 * @example formatTokens(null) // "—"
 */
export function formatTokens(count) {
  if (count == null) return '—';
  if (count < UNITS[0].from) return formatAmount(count);
  let unitIndex = UNITS.findLastIndex((unit) => count >= unit.from);
  let scaled = roundToThreeDigits(count / UNITS[unitIndex].from);
  if (scaled >= 1000 && unitIndex < UNITS.length - 1) {
    unitIndex += 1;
    scaled = roundToThreeDigits(count / UNITS[unitIndex].from);
  }
  return `${formatAmount(scaled)} ${UNITS[unitIndex].label}`;
}

export const pageTitle = (waitingSessionCount) =>
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
export function formatRelativeTime(instant, now) {
  const elapsedMs = Math.max(0, now - Date.parse(instant));
  if (elapsedMs < MINUTE_MS) return 'agora';
  if (elapsedMs < HOUR_MS) return `há ${Math.floor(elapsedMs / MINUTE_MS)} min`;
  if (elapsedMs < DAY_MS) return `há ${Math.floor(elapsedMs / HOUR_MS)} h`;
  const days = Math.floor(elapsedMs / DAY_MS);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/** Data e hora locais, para o texto que aparece ao passar o mouse. */
export function exactTime(instant, timeZone) {
  const { day, month, hour, minute } = localParts(Date.parse(instant), timeZone);
  const pad = (amount) => String(amount).padStart(2, '0');
  return `${pad(day)}/${pad(month)} ${pad(hour)}:${pad(minute)}`;
}

const ACTION_VERBS = {
  Edit: 'editou', MultiEdit: 'editou', NotebookEdit: 'editou', Write: 'escreveu', Read: 'leu',
  Bash: 'rodou', Grep: 'buscou', Glob: 'listou', WebFetch: 'abriu', WebSearch: 'pesquisou',
};
const FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit', 'Write', 'Read']);

/** Última ação do agente como verbo, sem expor o nome da ferramenta. Ferramenta desconhecida fica como veio. */
export function describeAction({ tool, summary }) {
  const verb = ACTION_VERBS[tool];
  if (!verb) return tool;
  const target = FILE_TOOLS.has(tool) ? summary?.split('/').filter(Boolean).at(-1) : summary;
  return [verb, target].filter(Boolean).join(' ');
}

export const folderName = (cwd) => cwd?.split(/[\\/]/).filter(Boolean).at(-1) ?? null;

/** Título e ponto do ícone da aba: o número só conta quem aguarda permissão; "sua vez" recente só põe o ponto. */
export function tabIndicator(sessions) {
  return {
    title: pageTitle(sessions.filter((session) => session.status === 'waiting').length),
    dot: sessions.some((session) => session.status === 'your_turn' && session.recent),
  };
}

export const describeSessionTokens = ({ day, total }) => `hoje: ${formatTokens(day.primary)} · sessão inteira: ${formatTokens(total.primary)}`;

export function describeCallGroup({ callCount, tokens, sessionShare, rejectedCount }) {
  return [
    `${callCount} ${callCount === 1 ? 'chamada' : 'chamadas'}`,
    `total ${formatTokens(tokens.primary)}`,
    sessionShare == null ? null : `${Math.round(sessionShare * 100)}% da sessão`,
    rejectedCount > 0 ? `${rejectedCount} ${rejectedCount === 1 ? 'reprovou' : 'reprovaram'}` : null,
  ].filter(Boolean).join(' · ');
}
