interface HeartbeatBarsProps {
  counts: number[];
  lit: boolean;
}

const BAR_MIN_HEIGHT = 2;
const BAR_MAX_HEIGHT = 14;
const heightOf = (count: number) => (count === 0 ? BAR_MIN_HEIGHT : Math.min(BAR_MAX_HEIGHT, 3 + count * 2.6));

/** 20 barrinhas: ações a cada 30 s nos últimos 10 min; a última é a mais recente. */
export function HeartbeatBars({ counts, lit }: HeartbeatBarsProps) {
  return (
    <span className="heartbeat" title="ações nos últimos 10 min" aria-hidden="true">
      {counts.map((count, index) => (
        <span key={index} className={count === 0 ? 'heartbeat__bar' : lit ? 'heartbeat__bar heartbeat__bar--lit' : 'heartbeat__bar heartbeat__bar--active'} style={{ height: heightOf(count) }} />
      ))}
    </span>
  );
}
