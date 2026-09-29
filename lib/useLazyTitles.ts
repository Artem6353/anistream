'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardTitle } from './types';

/** S2.2 (аудит 28.09): ленивые рельсы главной. Сервер передаёт только слаги (~0.3 КБ
    в RSC-payload на рельс вместо ~27 КБ полных Title), а карточки догружаются существующим
    /api/titles, когда блок доезжает до вьюпорта (IntersectionObserver, запас 800px).
    Fetch — один раз на монтирование sentinel'а; порядок карточек = порядок запрошенных слагов. */
export function useLazyTitles(slugs: string[]) {
  const [items, setItems] = useState<CardTitle[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [node, setNode] = useState<HTMLElement | null>(null);
  const started = useRef(false);
  const key = slugs.join(',');
  const sentinel = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    if (!node || !key || started.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      /* Страховка (старые WebView/SSR-гидрация без IO): грузим сразу.
         Аудит 30.09 (react-hooks/set-state-in-effect): старт уводим в микрозадачу —
         setState не вызывается синхронно в теле эффекта (каскадного рендера нет). */
      queueMicrotask(() => {
        if (started.current) return;
        started.current = true;
        setState('loading');
        load();
      });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || started.current) return;
        started.current = true;
        io.disconnect();
        setState('loading');
        load();
      },
      { rootMargin: '800px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();

    function load() {
      fetch(`/api/titles?slugs=${encodeURIComponent(key)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const bySlug = new Map<string, CardTitle>(
            ((j?.items ?? []) as CardTitle[]).map((t) => [t.slug, t]),
          );
          const ordered = key
            .split(',')
            .map((s) => bySlug.get(s))
            .filter((t): t is CardTitle => Boolean(t));
          setItems(ordered);
          setState('ready');
        })
        .catch(() => setState('error'));
    }
  }, [node, key]);

  return { sentinel, items, state };
}
