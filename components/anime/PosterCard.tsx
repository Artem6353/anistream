import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { CardTitle } from '@/lib/types';
import { TYPE_LABELS, genreLabel } from '@/lib/labels';
import { episodesWord } from '@/lib/format';
import { PosterArt } from './PosterArt';
import { BookmarkButton } from './BookmarkButton';
import { IconPlay, IconStar } from '@/components/ui/icons';

/** Плашка статуса на карточке (аудит, блок 1): только три случая, «Завершён» НЕ рендерится.
    ongoing → «Онгоинг» (зелёный), upcoming → «Анонс» (синий),
    finished && year >= 2025 → «Новинка» (фиолетовый); остальное — без плашки. */
function statusBadge(t: CardTitle): { label: string; color: string } | null {
  if (t.status === 'ongoing') return { label: 'Онгоинг', color: '#10b981' };
  if (t.status === 'upcoming') return { label: 'Анонс', color: '#3b82f6' };
  if (t.status === 'finished' && t.year >= 2025) return { label: 'Новинка', color: '#8b5cf6' };
  return null;
}

/** Карточка тайтла: постер, рейтинг, быстрые действия.
    S2.2: принимает CardTitle-проекцию (полный Title тоже совместим) — лёгкий RSC-payload. */
export function PosterCard({
  title,
  progress,
  resumeEpisode,
  resumeHref,
  resumeNote,
  showBadge = true,
}: {
  title: CardTitle;
  progress?: number;
  /** Последняя просмотренная серия — для подписи «Продолжить с серии N» (рейл «Продолжить просмотр»). */
  resumeEpisode?: number;
  /** Переопределение ссылки карточки (например, сразу на плеер последней просмотренной серии). */
  resumeHref?: string;
  /** Замена подписи (итерация 3.6, задача 4): для iframe-источников позиция недоступна,
   *  поэтому вместо «Продолжить с серии N» показываем «Открыто N назад». */
  resumeNote?: string;
  /** Плашка статуса (онгоинг/анонс/новинка) на постере; отключается в рейлах «Похожее». */
  showBadge?: boolean;
}) {
  const href = resumeHref ?? `/anime/${title.slug}`;
  const badge = statusBadge(title);
  return (
    /* S3.1: article→div — после h3→p карточка без заголовка давала W3C-warning
       «Article lacks heading» ×20 на главной; card-семантика классом .card сохранена. */
    <div className="card">
      {/* Аудит 30.09 (P2-2, label-content-name-mismatch): aria-label убран —
          доступное имя собирается из контента (sr-only заголовок + видимый бейдж),
          поэтому видимый текст всегда входит в имя. */}
      <Link className="card__media" href={href}>
        {/* S3.3: якорный текст ссылки-постера для краулеров/парсеров (аудит: неинформативные
            и дублирующиеся анкоры «Анонс 2027 12 серий»); для SR имя даёт aria-label. */}
        <span className="sr-only">{title.ru}</span>
        <PosterArt src={title.poster} seed={title.slug} initials={title.romaji} alt={`Постер: ${title.ru}`} />
        {showBadge && badge ? (
          <span
            className="card__badge"
            style={{ '--badge-color': badge.color } as CSSProperties}
          >
            {badge.label}
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
        {/* S3.1: h3→p — карточки дублировались в H3 нескольких рельсов (аудит: «H3 без
            дубликатов»); заголовочная иерархия страницы — h1 (page) → h2 (секции). */}
        <p className="card__title">
          <Link href={href}>{title.ru}</Link>
        </p>
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
    </div>
  );
}
