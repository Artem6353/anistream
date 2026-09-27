'use client';

import { useEffect, useState } from 'react';
import type { Title } from '@/lib/types';
import { useLibrary } from '@/lib/library';
import { Rail } from './Rail';
import { PosterCard } from './PosterCard';

/** «Потому что вы смотрели X» (ТЗ блок 21): рекомендации от последнего просмотренного тайтла. */
export function BecauseRail() {
  const { history } = useLibrary();
  const [items, setItems] = useState<Title[]>([]);
  const [anchor, setAnchor] = useState('');
  const last = history[0]?.slug ?? '';

  useEffect(() => {
    if (!last) return;
    let cancelled = false;
    (async () => {
      const mine = history.slice(0, 40).map((h) => h.slug);
      const r = await fetch(`/api/reco?slugs=${encodeURIComponent([last, ...mine].join(','))}&limit=8`).catch(() => null);
      const j = r?.ok ? await r.json() : null;
      if (!cancelled && j?.items?.length) {
        setItems(j.items);
        const tr = await fetch(`/api/titles?slugs=${encodeURIComponent(last)}`).catch(() => null);
        const tj = tr?.ok ? await tr.json() : null;
        setAnchor(tj?.items?.[0]?.ru ?? last);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  if (!items.length) return null;
  return (
    <Rail title={`Потому что вы смотрели «${anchor}»`}>
      {items.map((t) => (
        <PosterCard key={t.slug} title={t} />
      ))}
    </Rail>
  );
}
