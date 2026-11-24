import Link from 'next/link';
import type { CardTitle } from '@/lib/types';
import { PosterArt } from '@/components/anime/PosterArt';
import { cardEpisodeInfo } from '@/lib/episodes';
import { IconStar } from '@/components/ui/icons';

const ROOT = '/preview/aninova-3';

const status = (t: CardTitle) => {
  if (t.status === 'ongoing') return { label: 'Онгоинг', tone: 'ok' as const };
  if (t.status === 'upcoming') return { label: 'Анонс', tone: 'info' as const };
  if (t.year >= 2025) return { label: 'Новинка', tone: 'accent' as const };
  return null;
};

/** Карточка каталога: реальный постер через прокси /img, без вложенных интерактивных зон. */
export function A3Card({ title, size = 'grid', progress }: { title: CardTitle; size?: 'grid' | 'wide'; progress?: number }) {
  const badge = status(title);
  const eps = cardEpisodeInfo(title);
  return (
    <Link
      className={`a3-card a3-card--${size}`}
      href={`${ROOT}/anime/${title.slug}`}
      data-a3-focusable
      aria-label={`${title.ru}${title.year ? `, ${title.year}` : ''}${title.score > 0 ? `, рейтинг ${title.score.toFixed(1)}` : ''}`}
    >
      <span className="a3-card__art">
        <PosterArt src={title.poster} seed={title.slug} initials={title.ru || '?'} alt={`Постер: ${title.ru}`} width={size === 'wide' ? 260 : 220} />
        {badge ? <span className={`a3-badge a3-badge--${badge.tone}`}>{badge.label}</span> : null}
        {title.score > 0 ? (
          <span className="a3-card__score">
            <IconStar size={11} /> {title.score.toFixed(1)}
          </span>
        ) : null}
        {progress && progress > 0 ? <span className="a3-card__progress" style={{ width: `${Math.min(100, progress)}%` }} /> : null}
      </span>
      <span className="a3-card__body">
        <span className="a3-card__title">{title.ru}</span>
        <span className="a3-card__meta">
          {title.year}
          {eps.count !== null && eps.count > 1 ? ` · ${eps.count}${eps.totalUnknown ? '+' : ''} сер.` : ''}
        </span>
      </span>
    </Link>
  );
}
