import { useCallback, useEffect, useRef, useState } from 'react';
import { SPARK_LIFETIME_MS, pruneLiveEvents, type LiveEvent } from '../lib/motion';
import type { AgentEvent } from '../lib/types';

/** Guarda os eventos ao vivo só pelo tempo que a faísca dura; quem desenha decide quais viram faísca. */
export function useLiveSparks() {
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const received = useRef(0);
  const pruneTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = pruneTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const push = useCallback((event: AgentEvent) => {
    const receivedAt = Date.now();
    received.current += 1;
    const key = `${event.id ?? 'live'}-${received.current}`;
    setLiveEvents((current) => [...pruneLiveEvents(current, receivedAt), { key, event, receivedAt }]);
    const timer = setTimeout(() => {
      pruneTimers.current.delete(timer);
      setLiveEvents((current) => pruneLiveEvents(current, Date.now()));
    }, SPARK_LIFETIME_MS + 50);
    pruneTimers.current.add(timer);
  }, []);
  return { liveEvents, push };
}
