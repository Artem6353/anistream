'use client';

import Link from 'next/link';
import { useLibrary } from '@/lib/library';
import type { HistoryEntry } from '@/lib/types';
import { IconPlay } from '@/components/ui/icons';

/**
 * Главная кнопка действия на странице тайтла (итерация 3.6, задача 3):
 *  - истории нет            → «Смотреть онлайн» → /anime/{slug}/1 (как было);
 *  - есть запись для slug   → «Продолжить с серии N» → /anime/{slug}/{N}
 *                             + маленькая ссылка «Смотреть с начала» → /anime/{slug}/1;
 *  - фильм (1 эпизод) с историей → «Продолжить просмотр» → /anime/{slug}/1.
 * Серия берётся из самой свежей записи slug по updatedAt (история хранится
 * newest-first, но перестраховываемся явным максимумом — как в рейле).
 */
export function WatchButton({ slug, episodes }: { slug: string; episodes: number }) {
  const { history } = useLibrary();
  let entry: HistoryEntry | undefined;
  for (const h of history) {
    if (h.slug !== slug) continue;
    if (!entry || (h.updatedAt ?? 0) > (entry.updatedAt ?? 0)) entry = h;
  }

  if (!entry) {
    return (
      <Link className="btn btn--primary btn--lg" href={`/anime/${slug}/1`}>
        <IconPlay size={16} />
        Смотреть с 1-й серии
      </Link>
    );
  }

  if (episodes <= 1) {
    return (
      <Link className="btn btn--primary btn--lg" href={`/anime/${slug}/1`}>
        <IconPlay size={16} />
        Продолжить просмотр
      </Link>
    );
  }

  return (
    <>
      <Link className="btn btn--primary btn--lg" href={`/anime/${slug}/${entry.episode}`}>
        <IconPlay size={16} />
        Продолжить с серии {entry.episode}
      </Link>
      <Link className="watch-restart" href={`/anime/${slug}/1`}>
        Смотреть с начала
      </Link>
    </>
  );
}
