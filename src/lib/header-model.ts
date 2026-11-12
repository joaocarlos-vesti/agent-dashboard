import { cardModel } from './card-model';
import { dayOptions, localParts } from './day';
import { formatRelativeTime } from './format';
import { revealPathOf, type MapTree } from './map-tree';
import type { RevealPath } from './ui-state';
import type { AttentionItem } from './types';

export interface HeaderInput {
  now: number;
  lastUpdateAt: number | null;
  timeZone: string | undefined;
  viewedDay: string;
  pastDay: boolean;
  todayWaiting: AttentionItem[];
  todayTree: MapTree;
}

export interface DayButton { day: string; label: string; title: string; pressed: boolean }
export interface WaitingButton { text: string; since: string; sessionId: string; reveal: RevealPath | null }
export interface FrozenBanner { text: string; action: string }

export interface HeaderModel {
  updatedText: string;
  days: DayButton[];
  frozen: FrozenBanner | null;
  waiting: WaitingButton | null;
}

const longDayLabel = (day: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.parse(`${day}T12:00:00Z`));
const pad = (amount: number) => String(amount).padStart(2, '0');

function updatedTextOf(lastUpdateAt: number | null, timeZone: string | undefined): string {
  if (lastUpdateAt === null) return 'Aguardando a primeira atualização';
  const { hour, minute, second } = localParts(lastUpdateAt, timeZone);
  return `Atualizado às ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

// Quem espera você é sempre de agora, mesmo olhando outro dia; o botão leva à que espera há mais tempo.
function waitingButtonOf(todayWaiting: AttentionItem[], todayTree: MapTree, now: number, timeZone: string | undefined): WaitingButton | null {
  const [oldest] = [...todayWaiting].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (!oldest) return null;
  const node = todayTree.nodes[oldest.sessionId];
  const name = node ? cardModel(node, { now, timeZone, open: true }).title : 'sessão';
  return {
    text: todayWaiting.length === 1 ? `Aguardando você: ${name}` : `${todayWaiting.length} sessões aguardando você`,
    since: formatRelativeTime(oldest.at, now),
    sessionId: oldest.sessionId,
    reveal: revealPathOf(todayTree, oldest.sessionId),
  };
}

/** O que o cabeçalho mostra: horário da atualização, dias, aviso de dia congelado e o botão de quem espera você. */
export function headerModel({ now, lastUpdateAt, timeZone, viewedDay, pastDay, todayWaiting, todayTree }: HeaderInput): HeaderModel {
  return {
    updatedText: updatedTextOf(lastUpdateAt, timeZone),
    days: dayOptions(now, timeZone).map(({ day, label }) => ({ day, label, title: longDayLabel(day), pressed: day === viewedDay })),
    frozen: pastDay ? { text: `Você está vendo ${longDayLabel(viewedDay)}. Nada aqui se mexe.`, action: 'Voltar ao vivo' } : null,
    waiting: waitingButtonOf(todayWaiting, todayTree, now, timeZone),
  };
}
