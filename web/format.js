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
