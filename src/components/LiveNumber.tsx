import { useEffect, useRef, useState } from 'react';

const FLASH_MS = 900;

/** Número em destaque que pisca por um instante quando o valor muda depois de aparecer (tokens subindo ao vivo). */
export function LiveNumber({ value }: { value: string }) {
  const previousValue = useRef(value);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;
    setChanged(true);
    const timer = setTimeout(() => setChanged(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return <strong className={changed ? 'live-number live-number--changed' : 'live-number'}>{value}</strong>;
}
