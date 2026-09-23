'use client';

import Link from 'next/link';
import { useLibrary } from '@/lib/library';
import { useTitles } from '@/lib/useTitles';
import { library } from '@/lib/library';
import { timeAgo, formatTime } from '@/lib/format';
import { PosterArt } from '@/components/anime/PosterArt';
import { IconClock, IconPlay, IconTrash } from '@/components/ui/icons';

export function HistoryList() {
  const { history } = useLibrary();
  const slugs = [...new Set(history.map((h) => h.slug))];
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
      {history.map((h) => {
        const t = bySlug.get(h.slug);
        if (!t) return null;
        const pct = Math.min(100, Math.round((h.position / Math.max(1, h.duration)) * 100));
        return (
          <li className="history__item" key={`${h.slug}-${h.episode}`}>
            <Link className="history__link" href={`/anime/${h.slug}/${h.episode}`}>
              <span className="history__poster">
                <PosterArt src={t.poster} seed={t.slug} initials={t.romaji} alt="" />
              </span>
              <span className="history__info">
                <span className="history__title">{t.ru}</span>
                <span className="history__meta">
                  Серия {h.episode} · {formatTime(h.position)} / {formatTime(h.duration)} · {timeAgo(h.updatedAt)}
                </span>
                <span className="history__bar">
                  <span style={{ width: `${pct}%` }} />
                </span>
              </span>
              <span className="history__play icon-btn" aria-hidden>
                <IconPlay size={16} />
              </span>
            </Link>
            <button
              type="button"
              className="icon-btn history__remove"
              aria-label={`Удалить из истории: ${t.ru}, серия ${h.episode}`}
              onClick={() => library.removeHistory(h.slug, h.episode)}
            >
              <IconTrash size={15} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
