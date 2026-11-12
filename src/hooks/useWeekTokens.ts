import { useEffect, useState } from 'react';
import { fetchWeekTokenRows } from '../eventSource';
import { dayOptions } from '../lib/day';
import type { WeekTokensState } from '../lib/gauge-model';
import { weekTokensFromRows } from '../lib/queries';

/** Busca os últimos 7 dias cada vez que o painel de tokens abre; o resultado vem do banco, não dos eventos do dia. */
export function useWeekTokens({ isOpen, timeZone }: { isOpen: boolean; timeZone: string }): WeekTokensState {
  const [week, setWeek] = useState<WeekTokensState>({ status: 'loading' });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setWeek({ status: 'loading' });
    fetchWeekTokenRows(timeZone)
      .then((rows) => {
        if (!cancelled) setWeek({ status: 'ready', ...weekTokensFromRows(rows, dayOptions(Date.now(), timeZone).map(({ day }) => day)) });
      })
      .catch((error: unknown) => {
        if (!cancelled) setWeek({ status: 'error', message: error instanceof Error ? error.message : 'erro desconhecido' });
      });
    return () => { cancelled = true; };
  }, [isOpen, timeZone]);

  return week;
}
