'use client';

import { useEffect, useState } from 'react';
import type { Title } from '@/lib/types';
import { useLibrary } from '@/lib/library';
import { Rail } from './Rail';
import { PosterCard } from './PosterCard';

/** «Идеально на вечер» (ТЗ блок 21): топ-10 из жанра, где пользователь провёл больше всего времени. */
export function EveningRail() {
  const { history } = useLibrary();
  const [items, setItems] = useState<Title[]>([]);
  const [genre, setGenre] = useState('');

  useEffect(() => {
    if (!history.length) return;
    let cancelled = false;
    (async () => {
      const slugs = [...new Set(history.map((h) => h.slug))].slice(0, 60);
      const tr = await fetch(`/api/titles?slugs=${encodeURIComponent(slugs.join(','))}`).catch(() => null);
      const titles = (tr?.ok ? ((await tr.json()) as { items: Array<{ slug: string; genres: string[] }> }).items : []) ?? [];
      const gmap = new Map(titles.map((t) => [t.slug, t.genres]));
      const timeByGenre = new Map<string, number>();
      for (const h of history) {
        for (const g of gmap.get(h.slug) ?? []) timeByGenre.set(g, (timeByGenre.get(g) ?? 0) + (h.position || 0));
      }
      const top = [...timeByGenre.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!top || cancelled) return;
      const r = await fetch(`/api/reco?genre=${encodeURIComponent(top)}&slugs=${encodeURIComponent(history.map((h) => h.slug).join(','))}&limit=10`).catch(() => null);
      const j = r?.ok ? await r.json() : null;
      if (!cancelled) {
        setItems(j?.items ?? []);
        setGenre(top);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length]);

  if (!items.length) return null;
  return (
    <Rail title={`Идеально на вечер · ${genre}`}>
      {items.map((t) => (
        <PosterCard key={t.slug} title={t} />
      ))}
    </Rail>
  );
}
