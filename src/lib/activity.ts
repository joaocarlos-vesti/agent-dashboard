import { addTokens } from './usage';
import { localDay } from './day';
import type { Agent, Session } from './types';

const SECOND_MS = 1000;
const ACTIVE_WITHIN_MS = 12 * SECOND_MS;
const HEARTBEAT = { count: 20, windowMs: 30 * SECOND_MS };
const RHYTHM = { count: 40, windowMs: 15 * SECOND_MS };
const GAUGE_ACTIONS_WINDOW_MS = 60 * SECOND_MS;

const increment = (counts: number[], index: number) => {
  counts[index] = (counts[index] ?? 0) + 1;
};

interface Windows { endMs: number; windowMs: number; count: number }

function countInWindows(actionTimes: number[], { endMs, windowMs, count }: Windows): number[] {
  const counts = Array(count).fill(0);
  for (const actionTime of actionTimes) {
    const age = endMs - actionTime;
    if (age >= 0 && age < windowMs * count) increment(counts, count - 1 - Math.floor(age / windowMs));
  }
  return counts;
}

/** Ações dos últimos 10 min em 20 barras de 30 s; a última barra é a mais recente. */
export const heartbeat = (actionTimes: number[], now: number) => countInWindows(actionTimes, { endMs: now, ...HEARTBEAT });

/** Ações dos últimos 10 min em 40 colunas de 15 s. */
export const rhythm = (actionTimes: number[], now: number) => countInWindows(actionTimes, { endMs: now, ...RHYTHM });

/** Ritmo de uma sessão encerrada: 40 colunas cobrindo do início ao fim, sem depender do relógio. */
export function endedRhythm(actionTimes: number[], startMs: number, endMs: number): number[] {
  const windowMs = Math.max((endMs - startMs) / RHYTHM.count, SECOND_MS);
  const counts = Array(RHYTHM.count).fill(0);
  for (const actionTime of actionTimes) {
    if (actionTime >= startMs && actionTime <= endMs) increment(counts, Math.min(RHYTHM.count - 1, Math.floor((actionTime - startMs) / windowMs)));
  }
  return counts;
}

export const isActive = (actionTimes: number[], now: number): boolean => actionTimes.some((actionTime) => now - actionTime >= 0 && now - actionTime <= ACTIVE_WITHIN_MS);

export function lineState({ status, lit }: { status: string; lit: boolean }): 'flow' | 'dashed' | 'idle' {
  if (lit) return 'flow';
  return status === 'running' ? 'dashed' : 'idle';
}

export function countByDay(actionTimes: number[], timeZone: string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const actionTime of actionTimes) {
    const day = localDay(actionTime, timeZone);
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts;
}

const agentsOf = (session: Session): Agent[] => [...session.agents, ...session.workflows.flatMap((workflow) => workflow.agents)];

/** Os três números do mostrador, a partir de todas as sessões visíveis. */
export function gaugeSummary(sessions: Session[], now: number): { activeAgents: number; actionsLastMinute: number; tokensToday: number } {
  return {
    activeAgents: sessions.flatMap(agentsOf).filter((agent) => agent.status === 'running' && isActive(agent.actionAt, now)).length,
    actionsLastMinute: sessions.flatMap((session) => session.actionAt).filter((actionTime) => now - actionTime >= 0 && now - actionTime < GAUGE_ACTIONS_WINDOW_MS).length,
    tokensToday: addTokens(sessions.map((session) => session.tokens.day)).primary,
  };
}
