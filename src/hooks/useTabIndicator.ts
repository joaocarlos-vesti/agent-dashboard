import { useEffect } from 'react';
import { faviconHref, tabIndicator } from '../lib/format';
import type { Session } from '../lib/types';

/** Título e ícone da aba: quem espera permissão vira número no título; "sua vez" recente vira ponto no ícone. */
export function useTabIndicator(sessions: Pick<Session, 'status' | 'recent'>[]) {
  const { title, dot } = tabIndicator(sessions);
  useEffect(() => {
    document.title = title;
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.append(icon);
    }
    icon.href = faviconHref(dot);
  }, [title, dot]);
}
