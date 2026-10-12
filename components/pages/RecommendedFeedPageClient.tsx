'use client';

import { useEffect, useState } from 'react';
import type { Title } from '@/lib/types';
import { useLibrary } from '@/lib/library';
import { PosterCard } from '@/components/anime/PosterCard';

/** Персональная лента рекомендаций (ТЗ блок 21): гибрид контентной и коллаборативной фильтрации,
    не повторяет просмотренное. */
export default function RecommendedPage() {
  const { history, lists, bookmarks } = useLibrary();
  const [items, setItems] = useState<Title[]>([]);
  const slugs = [...new Set([...history.map((h) => h.slug), ...Object.keys(lists), ...bookmarks])];

  useEffect(() => {
    if (!slugs.length) return;
    let cancelled = false;
    fetch(`/api/reco?slugs=${encodeURIComponent(slugs.join(','))}&limit=24`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !cancelled && setItems(j?.items ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs.join(',')]);

  return (
    <div className="container">
      <h1>Для вас</h1>
      <p className="stats__empty">Гибрид рекомендаций: ваши жанры + вкусы похожих пользователей. Просмотренное исключено.</p>
      {slugs.length ? (
        <div className="poster-grid">
          {items.map((t) => (
            <PosterCard key={t.slug} title={t} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>Пока нет данных</h2>
          <p>Посмотрите пару серий или добавьте тайтлы в список — лента подстроится под вас.</p>
        </div>
      )}
    </div>
  );
}
