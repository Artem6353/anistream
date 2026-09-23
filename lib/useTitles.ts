'use client';

import { useEffect, useState } from 'react';
import type { Title } from './types';

/** Клиентская подгрузка тайтлов по слагам через /api/titles (без тяжёлого бандла датасета). */
export function useTitles(slugs: string[]) {
  const [items, setItems] = useState<Title[]>([]);
  const key = slugs.join(',');

  useEffect(() => {
    if (!key) {
      setItems([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/titles?slugs=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setItems(j?.items ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { items, bySlug: new Map(items.map((t) => [t.slug, t])) };
}
