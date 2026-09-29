import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 3600;
import { getTitle, similarTitles } from '@/lib/catalog';
import { TYPE_LABELS, genreLabel } from '@/lib/labels';
import { MetaBadges } from '@/components/anime/MetaBadges';
import { ExpandableText } from '@/components/anime/ExpandableText';
import { TrailerCard } from '@/components/anime/TrailerCard';
import { ListStatusButton } from '@/components/anime/ListStatusButton';
import { WatchOrder } from '@/components/anime/WatchOrder';
import { EpisodeGuide } from '@/components/anime/EpisodeGuide';
import { GalleryLightbox } from '@/components/anime/GalleryLightbox';
import { ReviewsSection } from '@/components/social/ReviewsSection';
import { AgeGate } from '@/components/system/AgeGate';
import { SOURCE_LABELS } from '@/lib/labels';
import { EpisodeList } from '@/components/anime/EpisodeList';
import { BookmarkButton } from '@/components/anime/BookmarkButton';
import { Rail } from '@/components/anime/Rail';
import { PosterCard } from '@/components/anime/PosterCard';
import { PosterArt } from '@/components/anime/PosterArt';
import { WatchButton } from '@/components/anime/WatchButton';
import { artUri } from '@/lib/art';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { imgProxyUrl } from '@/lib/img';

/** Обрезка описания по границе слова/предложения (SEO-6, аудит 30.09). */
function clampSentence(text: string, max = 155): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:—-]+$/, '') + '…';
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getTitle(slug);
  if (!t) notFound();
  return {
    /* S3.2: суффикс «— AniNova» убран — его добавляет title.template (было «… — AniNova · AniNova»).
       Аудит 30.09 (SEO-6): description режется по границе слова (раньше рубил
       посреди слова на 150-м символе); og:image не дублируем сырым внешним баннером —
       единый источник — генератор app/anime/[slug]/opengraph-image.tsx (свой origin,
       всегда валидный, с фолбэком). */
    title: `${t.ru} (${t.year || '—'}) смотреть онлайн`,
    description: clampSentence(t.description || t.shikimori?.description || `Смотреть ${t.ru} онлайн: серии, озвучки, график выхода.`, 155),
    alternates: { canonical: `/anime/${t.slug}` },
    openGraph: {
      type: 'video.tv_show',
      url: `/anime/${t.slug}`,
      locale: 'ru_RU',
      siteName: 'AniNova',
      title: t.ru,
      description: clampSentence(t.description || '', 155) || undefined,
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = getTitle(slug);
  if (!title || title.hidden) notFound();
  const similar = similarTitles(title);
  /* ТЗ 4.1 (4.2): показываем одно основное описание; shikimori-вариант уходит
   * в сворачиваемый блок «Альтернативное описание» (по умолчанию свёрнут). */
  const altDesc =
    title.description && title.shikimori?.description && title.shikimori.description.trim() !== title.description.trim()
      ? title.shikimori.description
      : null;

  const ld = {
    '@context': 'https://schema.org',
    '@type': title.type === 'movie' ? 'Movie' : 'TVSeries',
    name: title.ru,
    alternateName: title.romaji,
    description: title.description || title.shikimori?.description || '',
    image: title.poster,
    ...(title.score > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: title.score, bestRating: 10, ratingCount: title.favourites } } : {}),
    genre: title.genres.slice(0, 5),
    ...(title.type !== 'movie'
      ? { numberOfSeasons: 1, numberOfEpisodes: title.episodes, containsSeason: { '@type': 'TVSeason', numberOfEpisodes: title.episodes, seasonNumber: 1 } }
      : {}),
  };
  /* Аудит 30.09 (SEO-3): item — относительный 'catalog' (невалидно для
     BreadcrumbList, ошибка в Rich Results) + пропущен уровень «Главная». */
  const siteUrl = getProvidersConfig().site.url.replace(/\/$/, '');
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${siteUrl}/catalog` },
      { '@type': 'ListItem', position: 3, name: title.ru, item: `${siteUrl}/anime/${title.slug}` },
    ],
  };

  return (
    <>
      {/* Аудит 30.09 (P1-8): экранируем '<' — иначе '</script>' в описании тайтла
          (внешние API/ручные правки) разрывает блок и позволяет инъекцию скрипта.
          HomeJsonLd так делал и раньше — теперь единообразно. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, '\\u003c') }} />
    <AgeGate adult={Boolean(title.isAdult)} />
    <div className="detail">
      <div className="detail__backdrop" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={(title.banner ? imgProxyUrl(title.banner, 1600, 72) : null) ?? artUri(title.slug, title.romaji, true)} alt="" />
      </div>
      <div className="container">
        <div className="detail__inner">
          <div className="detail__poster">
            <PosterArt eager src={title.poster} seed={title.slug} initials={title.romaji} alt={`Постер: ${title.ru}`} width={240} />
          </div>
          <div className="detail__info">
            <MetaBadges title={title} />
            <h1 className="detail__title">{title.ru}</h1>
            <p className="detail__orig">
              {title.romaji}
              {title.en ? ` · ${title.en}` : ''}
              {title.shikimori?.ru ? ` · ${title.shikimori.ru}` : ''}
            </p>
            <div className="detail__actions">
              <WatchButton slug={title.slug} episodes={title.episodes} type={title.type} />
              <ListStatusButton slug={title.slug} />
              <BookmarkButton slug={title.slug} className="bookmark-btn--big" />
            </div>
            <dl className="detail__facts">
              <div>
                <dt>Рейтинг</dt>
                <dd>{title.score > 0 ? `${title.score.toFixed(1)} / 10` : '—'}</dd>
              </div>
              <div>
                <dt>Тип</dt>
                <dd>{TYPE_LABELS[title.type]}</dd>
              </div>
              <div>
                <dt>Эпизоды</dt>
                <dd>{title.episodes}</dd>
              </div>
              <div>
                <dt>Длительность</dt>
                <dd>{title.duration ? `${title.duration} мин / серия` : '—'}</dd>
              </div>
              <div>
                <dt>Студия</dt>
                <dd>{title.studios?.length ? title.studios.join(', ') : '—'}</dd>
              </div>
              <div>
                <dt>Первоисточник</dt>
                <dd>{title.source ? (SOURCE_LABELS[title.source] ?? title.source) : '—'}</dd>
              </div>
            </dl>
            <div className="chips">
              {title.genres.map((g) => (
                <Link key={g} className="chip" href={`/genre/${g}`}>
                  {genreLabel(g)}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="detail__columns">
          <section aria-label="Описание">
            <h2 className="section-title">Описание</h2>
            <div style={{ marginTop: 10 }}>
              <ExpandableText
                text={
                  title.description ||
                  title.shikimori?.description ||
                  'Описание для этого тайтла ещё не добавлено: данные дособираются фоном из Shikimori (scripts/enrich-shikimori-resumable.mjs). Оцените постер, рейтинг и жанры — или загляните в похожие тайтлы ниже.'
                }
                lines={4}
              />
            </div>
            {title.shikimori?.id ? (
              <p className="detail__desc-src">
                Источник:{' '}
                <a className="detail__shiki-link" href={`https://shikimori.io/animes/${title.shikimori.id}`} target="_blank" rel="noopener noreferrer">
                  Shikimori ↗
                </a>
              </p>
            ) : null}
            {altDesc ? (
              <details className="detail__alt-desc">
                <summary>Альтернативное описание</summary>
                <ExpandableText text={altDesc} lines={6} />
              </details>
            ) : null}
            <div style={{ marginTop: 24 }}>
              <TrailerCard title={title} />
            </div>
          </section>
          {title.episodes > 1 ? (
            <section aria-label="Серии">
              <EpisodeList title={title} />
            </section>
          ) : null}
        </div>

        <div className="detail-extra">
          <WatchOrder title={title} />
          {title.characters?.length ? (
            <div>
              <h2 className="section-title">Персонажи</h2>
              <div className="chars">
                {title.characters.slice(0, 12).map((c) => (
                  <div key={c.name} className="char">
                    {c.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgProxyUrl(c.img, 176) ?? undefined} alt={c.name} loading="lazy" />
                    ) : (
                      <span className="char__noimg" />
                    )}
                    <span className="char__name">{c.name}</span>
                    <span className="char__role">{c.role === 'MAIN' ? 'Главный' : c.role === 'SUPPORTING' ? 'Второстепенный' : 'Эпизодический'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {/* ТЗ 4.1 (4.5): кадры — минимум 4, иначе секцию не показываем; максимум 6 */}
          {title.screenshots && title.screenshots.length >= 4 ? (
            <div>
              <h2 className="section-title">Кадры из аниме</h2>
              <GalleryLightbox images={title.screenshots.slice(0, 6)} title={title.ru} />
            </div>
          ) : null}
          <div>
            <EpisodeGuide title={title} />
          </div>
          <div>
            <ReviewsSection slug={title.slug} />
          </div>
        </div>
      </div>

      {similar.length ? (
        <Rail title="Похожее">
          {similar.map((t) => (
            <PosterCard key={t.slug} title={t} showBadge={false} />
          ))}
        </Rail>
      ) : null}
    </div>
    </>
  );
}
