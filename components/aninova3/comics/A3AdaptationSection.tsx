import Link from 'next/link';
import type { LinkedAnime } from '@/lib/aninova3/comics/model';
import { comicSideRoleLabel } from '@/lib/aninova3/comics/model';import { TYPE_LABELS } from '@/lib/labels';
import { PosterArt } from '@/components/anime/PosterArt';

const ROOT = '/preview/aninova-3';

/**
 * Секция «Аниме-адаптации» на странице комикса.
 *
 * Только подтверждённые связи из relation-графа: одинаковое название адаптацией не
 * считается. Если связей нет — секция не рендерится. Ссылки получают стабильный
 * ключ `anime:<id>`, чтобы пульт возвращал фокус на ту же карточку после «назад».
 */
export function A3AdaptationSection({ links }: { links: LinkedAnime[] }) {
  if (!links.length) return null;
  /* Направление хотя бы одной связи определено только по датам — говорим об этом одной строкой. */
  const approximate = links.some((l) => l.confidence === 'inferred');
  const undescribed = links.some((l) => l.confidence === 'unknown');
  return (
    <section className="a3-adaptations" aria-labelledby="a3-adaptations-title">
      <div className="a3-section__head a3-section__head--inline">
        <div>
          <h2 className="a3-h2" id="a3-adaptations-title">
            Аниме-адаптации
          </h2>
          <p className="a3-muted a3-section__desc">
            Связи подтверждены по идентификатору AniList.
            {approximate ? ' Направление части связей определено по годам выпуска и требует проверки.' : ''}
            {undescribed ? ' Есть связи с неподтверждённым направлением.' : ''}
          </p>
        </div>
      </div>
      <div className="a3-adaptation-grid">
        {links.map((link) => (
          <Link
            className={`a3-adaptation${link.primary ? ' is-primary' : ''}`}
            key={link.anime.anilistId}
            href={`${ROOT}/anime/${link.anime.slug}`}
            data-a3-focusable
            data-a3-key={`anime:${link.anime.anilistId}`}
          >
            <span className="a3-adaptation__art">
              <PosterArt
                src={link.anime.poster}
                seed={link.anime.slug}
                initials={link.anime.romaji}
                alt={`Постер: ${link.anime.ru}`}
                width={120}
              />
            </span>
            <span className="a3-adaptation__body">
              <span className="a3-adaptation__role">{comicSideRoleLabel(link)}</span>
              <span className="a3-adaptation__title">{link.anime.ru}</span>
              <span className="a3-adaptation__meta">
                {TYPE_LABELS[link.anime.type]} · {link.anime.year}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
