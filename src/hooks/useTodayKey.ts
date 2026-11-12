import { useEffect, useState } from 'react';
import { BROWSER_TIME_ZONE } from '../config';
import { localDay } from '../lib/day';

const CHECK_EVERY_MS = 30000;

/** O dia de hoje (AAAA-MM-DD) no fuso do navegador; vira sozinho na meia-noite. */
export function useTodayKey(): string {
  const [today, setToday] = useState(() => localDay(Date.now(), BROWSER_TIME_ZONE));
  useEffect(() => {
    const check = setInterval(() => setToday(localDay(Date.now(), BROWSER_TIME_ZONE)), CHECK_EVERY_MS);
    return () => clearInterval(check);
  }, []);
  return today;
}
