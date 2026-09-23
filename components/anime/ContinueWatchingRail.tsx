'use client';

import { useLibrary } from '@/lib/library';
import { useTitles } from '@/lib/useTitles';
import { Rail } from './Rail';
import { PosterCard } from './PosterCard';

/** «Продолжить просмотр»: собирается из локальной истории пользователя. */
export function ContinueWatchingRail() {
  const { history } = useLibrary();
  const slugs = [...new Set(history.map((h) => h.slug))].slice(0, 12);
  const { bySlug } = useTitles(slugs);
  const items = history
    .map((h) => ({ h, t: bySlug.get(h.slug) }))
    .filter((x): x is { h: (typeof history)[number]; t: NonNullable<ReturnType<typeof bySlug.get>> } => Boolean(x.t))
    .slice(0, 12);

  if (!items.length) return null;

  return (
    <Rail title="Продолжить просмотр">
      {items.map(({ h, t }) => (
        <PosterCard key={`${h.slug}-${h.episode}`} title={t} progress={(h.position / Math.max(1, h.duration)) * 100} />
      ))}
    </Rail>
  );
}
