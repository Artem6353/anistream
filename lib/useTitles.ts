'use client';

import { useEffect, useState } from 'react';
import type { Title } from './types';

/** Клиентская подгрузка тайтлов по слагам через /api/titles (без тяжёлого бандла датасета).
 *  Аудит 30.09 (react-hooks/set-state-in-effect): состояние хранится вместе с ключом
 *  запроса — при смене slugs старые данные не показываются, синхронный setState
 *  в эффекте не нужен (значение выводится при рендере). */
export function useTitles(slugs: string[]) {
  const [loaded, setLoaded] = useState<{ key: string; items: Title[] } | null>(null);
  const key = slugs.join(',');

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/titles?slugs=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setLoaded({ key, items: (j?.items ?? []) as Title[] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  const items = loaded?.key === key ? loaded.items : [];
  return { items, bySlug: new Map(items.map((t) => [t.slug, t])) };
}
