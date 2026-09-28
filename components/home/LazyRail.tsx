'use client';

import Link from 'next/link';
import { Rail } from '@/components/anime/Rail';
import { PosterCard } from '@/components/anime/PosterCard';
import { useLazyTitles } from '@/lib/useLazyTitles';

/** S2.2 (аудит 28.09): рельс ниже сгиба вне SSR-HTML главной (был 1081 КБ / 268 <img>).
    Сервер кладёт в страницу только заголовок, ссылку «все» и слаги; карточки догружаются
    /api/titles при скролле. До загрузки — shimmer-skeleton (высота зарезервирована, CLS=0). */
export function LazyRail({
  title,
  action,
  slugs,
  skeleton = 10,
}: {
  title: string;
  action?: { href: string; label: string };
  slugs: string[];
  /** Сколько карточек-заглушек показать до загрузки (по числу элементов рельса). */
  skeleton?: number;
}) {
  const { sentinel, items, state } = useLazyTitles(slugs);

  if (state === 'error' || (state === 'ready' && !items.length)) return null;

  if (state === 'ready') {
    return (
      <Rail title={title} action={action}>
        {items.map((t) => (
          <PosterCard key={t.slug} title={t} />
        ))}
      </Rail>
    );
  }

  return (
    <section className="rail-section" aria-label={title} ref={sentinel}>
      <div className="rail-head">
        <h2 className="section-title">{title}</h2>
        {action ? (
          <Link className="rail-more" href={action.href}>
            {action.label}
          </Link>
        ) : null}
      </div>
      <div className="skeleton-rail" aria-hidden>
        {Array.from({ length: skeleton }, (_, i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    </section>
  );
}
