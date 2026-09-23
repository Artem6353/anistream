'use client';

import { useEffect, useState } from 'react';
import type { Title } from '@/lib/types';
import { useLibrary } from '@/lib/library';
import { useI18n } from '@/lib/i18n';
import { Rail } from './Rail';
import { PosterCard } from './PosterCard';

/** Персональная лента «Для вас» по жанровой аффинности списков/истории. */
export function ForYouRail() {
  const { lists, history, bookmarks } = useLibrary();
  const { t } = useI18n();
  const [items, setItems] = useState<Title[]>([]);
  const slugs = [...Object.keys(lists), ...bookmarks, ...history.map((h) => h.slug)].slice(0, 40).join(',');

  useEffect(() => {
    if (!slugs) return;
    let cancelled = false;
    fetch(`/api/reco?slugs=${encodeURIComponent(slugs)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !cancelled && setItems(j?.items ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slugs]);

  if (!items.length) return null;
  return (
    <Rail title={t('forYou')}>
      {items.map((x) => (
        <PosterCard key={x.slug} title={x} />
      ))}
    </Rail>
  );
}
