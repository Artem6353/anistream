'use client';

import { useLibrary } from '@/lib/library';
import { useTitles } from '@/lib/useTitles';
import type { HistoryEntry } from '@/lib/types';
import { Rail } from './Rail';
import { PosterCard } from './PosterCard';

/** «Продолжить просмотр»: собирается из локальной истории пользователя. */
export function ContinueWatchingRail() {
  const { history } = useLibrary();

  // История хранится по (slug, episode) — это правильно для прогресса каждой серии,
  // но в рейле нужна одна карточка на тайтл: самая свежая запись по updatedAt.
  const bySlug = new Map<string, HistoryEntry>();
  for (const entry of history) {
    const existing = bySlug.get(entry.slug);
    if (!existing || (entry.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
      bySlug.set(entry.slug, entry);
    }
  }
  const uniqueHistory = [...bySlug.values()]
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)) // свежие сначала
    .slice(0, 12); // лимит карточек рейла (был в компоненте)

  const slugs = uniqueHistory.map((h) => h.slug);
  const { bySlug: titles } = useTitles(slugs);
  const items = uniqueHistory
    .map((h) => ({ h, t: titles.get(h.slug) }))
    .filter((x): x is { h: HistoryEntry; t: NonNullable<ReturnType<typeof titles.get>> } => Boolean(x.t));

  if (!items.length) return null;

  return (
    <Rail title="Продолжить просмотр">
      {items.map(({ h, t }) => (
        <PosterCard
          key={h.slug}
          title={t}
          progress={(h.position / Math.max(1, h.duration)) * 100}
          resumeEpisode={h.episode}
          resumeHref={`/anime/${h.slug}/${h.episode}`}
        />
      ))}
    </Rail>
  );
}
