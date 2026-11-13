import { useEffect, useRef } from 'react';

/** Guarda sempre o valor mais novo sem recriar quem o lê: quem chama por ela nunca usa um handler velho. */
export function useLatestRef<Value>(value: Value) {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  return latest;
}
