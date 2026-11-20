'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Фильтры каталога: на мобильном — закрытый details, на десктопе — раскрытая
 * панель. open выставляется на DOM после гидратации, потому что фокусировать
 * элементы внутри закрытого <details> браузер не даёт (важно для D-pad).
 */
export function A3FiltersPanel({ summary, children }: { summary: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const sync = () => {
      if (!ref.current) return;
      ref.current.open = mq.matches;
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return (
    <details className="a3-filters" ref={ref}>
      <summary className="a3-filters__summary">{summary}</summary>
      {children}
    </details>
  );
}
