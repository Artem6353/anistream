import Link from 'next/link';
import type { Title } from '@/lib/types';
import { isProxiable } from '@/lib/img';
import { A3BannerImg } from './A3BannerImg';
import { PosterArt } from '@/components/anime/PosterArt';
import { cardEpisodeInfo } from '@/lib/episodes';
import { genreLabel } from '@/lib/labels';
import { IconPlay } from '@/components/ui/icons';

const ROOT = '/preview/aninova-3';

/** Главная-афиша из C: крупный кадр, спокойный скрим, без автокарусели.
 *  Если широкого кадра нет — постер в отдельной композиции, без искусственного кропа. */
export function A3Hero({ title }: { title: Title }) {
  const wide = isProxiable(title.banner) ? title.banner : null;
  const eps = cardEpisodeInfo(title);
  const watch = eps.count && eps.count > 0 ? `${ROOT}/anime/${title.slug}/1` : `${ROOT}/anime/${title.slug}`;

  return (
    <section className={`a3-hero${wide ? '' : ' a3-hero--poster'}`} aria-labelledby="a3-hero-title">
      {wide ? (
        <A3BannerImg className="a3-hero__bg" src={wide} priority />
      ) : null}
      <div className="a3-hero__scrim" aria-hidden />
      <div className="a3-wrap a3-hero__in">
        <div className="a3-hero__copy">
          <p className="a3-kicker">
            <span className="a3-pulse" aria-hidden /> Выбор редакции
          </p>
          <h1 className="a3-hero__title" id="a3-hero-title">
            {title.ru}
          </h1>
          <p className="a3-hero__meta">
            {title.year}
            {title.status === 'ongoing' ? ' · Онгоинг' : ''}
            {eps.count !== null && eps.count > 1 ? ` · ${eps.count}${eps.totalUnknown ? '+' : ''} серий` : ''}
            {title.score > 0 ? ` · ★ ${title.score.toFixed(1)}` : ''}
            {title.genres[0] ? ` · ${genreLabel(title.genres[0])}` : ''}
          </p>
          <p className="a3-hero__desc">{title.description}</p>
          <div className="a3-hero__actions">
            <Link className="a3-btn a3-btn--primary a3-btn--lg" href={watch}>
              <IconPlay size={18} /> Смотреть
            </Link>
            <Link className="a3-btn a3-btn--ghost a3-btn--lg" href={`${ROOT}/anime/${title.slug}`}>
              Подробнее
            </Link>
          </div>
        </div>
        {!wide ? (
          <div className="a3-hero__poster" aria-hidden>
            <PosterArt src={title.poster} seed={title.slug} initials={title.ru || '?'} alt="" width={300} eager />
          </div>
        ) : null}
      </div>
    </section>
  );
}
