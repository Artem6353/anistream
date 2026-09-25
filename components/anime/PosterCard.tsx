import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { Title } from '@/lib/types';
import { STATUS_LABELS, TYPE_LABELS, genreLabel } from '@/lib/labels';
import { episodesWord } from '@/lib/format';
import { PosterArt } from './PosterArt';
import { BookmarkButton } from './BookmarkButton';
import { IconPlay, IconStar } from '@/components/ui/icons';

/** Цвета статусных плашек (ТЗ 4.0, задача 6). */
const BADGE_COLORS: Record<string, string> = {
  ongoing: 'var(--success)',
  finished: '#60a5fa',
  upcoming: 'var(--warn)',
};

/** Карточка тайтла: постер, рейтинг, быстрые действия. */
export function PosterCard({
  title,
  progress,
  resumeEpisode,
  resumeHref,
  resumeNote,
  showBadge = true,
}: {
  title: Title;
  progress?: number;
  /** Последняя просмотренная серия — для подписи «Продолжить с серии N» (рейл «Продолжить просмотр»). */
  resumeEpisode?: number;
  /** Переопределение ссылки карточки (например, сразу на плеер последней просмотренной серии). */
  resumeHref?: string;
  /** Замена подписи (итерация 3.6, задача 4): для iframe-источников позиция недоступна,
   *  поэтому вместо «Продолжить с серии N» показываем «Открыто N назад». */
  resumeNote?: string;
  /** Плашка статуса (онгоинг/завершён/анонс) на постере; отключается в рейлах «Похожее». */
  showBadge?: boolean;
}) {
  const href = resumeHref ?? `/anime/${title.slug}`;
  return (
    <article className="card">
      <Link className="card__media" href={href} aria-label={title.ru}>
        <PosterArt src={title.poster} seed={title.slug} initials={title.romaji} alt={`Постер: ${title.ru}`} />
        {showBadge ? (
          <span
            className="card__badge"
            style={{ '--badge-color': BADGE_COLORS[title.status] } as CSSProperties}
          >
            {STATUS_LABELS[title.status]}
          </span>
        ) : null}
        {title.score > 0 ? (
          <span className="card__score" title={`Рейтинг ${title.score} / 10`}>
            <IconStar size={11} />
            {title.score.toFixed(1)}
          </span>
        ) : null}
        <span className="card__foot">
          <span>{title.year}</span>
          {title.episodes > 1 ? <span>{title.episodes} {episodesWord(title.episodes)}</span> : <span>{TYPE_LABELS[title.type]}</span>}
        </span>
        <span className="card__play" aria-hidden>
          <IconPlay size={18} />
        </span>
        {progress !== undefined && progress > 0 ? (
          <span className="card__progress" style={{ width: `${Math.min(100, progress)}%` }} />
        ) : null}
      </Link>
      <div className="card__body">
        <h3 className="card__title">
          <Link href={href}>{title.ru}</Link>
        </h3>
        <p className="card__meta">
          <span className="card__type">{TYPE_LABELS[title.type]}</span>
          <span className="card__genre">{genreLabel(title.genres[0] ?? '')}</span>
        </p>
        {resumeEpisode ? (
          <p className="card__resume">
            {resumeNote ?? (title.episodes > 1 ? `Продолжить с серии ${resumeEpisode}` : 'Продолжить просмотр')}
          </p>
        ) : null}
      </div>
      <BookmarkButton slug={title.slug} className="card__bookmark" />
    </article>
  );
}
