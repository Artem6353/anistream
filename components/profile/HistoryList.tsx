'use client';

import Link from 'next/link';
import { useLibrary } from '@/lib/library';
import { useTitles } from '@/lib/useTitles';
import { library } from '@/lib/library';
import { timeAgo, formatTime } from '@/lib/format';
import type { HistoryEntry } from '@/lib/types';
import { PosterArt } from '@/components/anime/PosterArt';
import { IconClock, IconPlay, IconTrash } from '@/components/ui/icons';

/**
 * Одна карточка на тайтл (итерация 3.6, задача 1): история хранится по
 * (slug, episode) — это правильный источник (lib/library.ts не трогаем),
 * группировка делается только в UI: из каждой группы берётся запись
 * с максимальным updatedAt, сортировка — свежие сначала.
 */
function latestBySlug(history: HistoryEntry[]): HistoryEntry[] {
  const bySlug = new Map<string, HistoryEntry>();
  for (const h of history) {
    const cur = bySlug.get(h.slug);
    if (!cur || (h.updatedAt ?? 0) > (cur.updatedAt ?? 0)) bySlug.set(h.slug, h);
  }
  return [...bySlug.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export function HistoryList() {
  const { history } = useLibrary();
  const items = latestBySlug(history);
  const slugs = items.map((h) => h.slug);
  const { bySlug } = useTitles(slugs);

  if (!history.length) {
    return (
      <div className="empty-state">
        <IconClock size={28} />
        <h2>История пуста</h2>
        <p>Начните смотреть любую серию — прогресс сохранится локально, и вы сможете продолжить с того же места.</p>
        <a className="btn btn--primary btn--md" href="/catalog">
          Начать просмотр
        </a>
      </div>
    );
  }

  return (
    <ul className="history">
      {items.map((h) => {
        const t = bySlug.get(h.slug);
        if (!t) return null;
        // Нативный прогресс известен только для file-источников (position ≥ 1 c и duration > 0).
        // Для iframe (Kodik / CVH / AniBoom) позиция всегда 0 — физический лимит браузера,
        // поэтому показываем «Смотрел N назад» без прогресс-бара и без обманчивого «0:00 / 0:00».
        const hasProgress = h.position >= 1 && h.duration > 0;
        const pct = hasProgress ? Math.min(100, Math.round((h.position / h.duration) * 100)) : 0;
        return (
          <li className="history__item" key={h.slug}>
            <Link className="history__link" href={`/anime/${h.slug}/${h.episode}`}>
              <span className="history__poster">
                <PosterArt src={t.poster} seed={t.slug} initials={t.romaji} alt="" />
              </span>
              <span className="history__info">
                <span className="history__title">{t.ru}</span>
                {hasProgress ? (
                  <>
                    <span className="history__meta">
                      {t.episodes > 1 ? `Последняя серия: ${h.episode}` : 'Просмотрено'} ·{' '}
                      {formatTime(h.position)} / {formatTime(h.duration)} · {timeAgo(h.updatedAt)}
                    </span>
                    <span className="history__bar">
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <span className="history__resume">
                      <IconPlay size={11} /> Продолжить с {formatTime(h.position)}
                    </span>
                  </>
                ) : (
                  <span className="history__meta">
                    {t.episodes > 1 ? `Последняя серия: ${h.episode} · ` : ''}Смотрел {timeAgo(h.updatedAt)}
                  </span>
                )}
              </span>
              <span className="history__play icon-btn" aria-hidden>
                <IconPlay size={16} />
              </span>
            </Link>
            <button
              type="button"
              className="icon-btn history__remove"
              aria-label={`Удалить из истории: ${t.ru}`}
              title="Удалить все серии этого тайтла из истории"
              onClick={() => library.removeHistory(h.slug)}
            >
              <IconTrash size={15} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
