import type { Metadata } from 'next';
import type { Title } from '@/lib/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 3600;
import { getTitle, loadTitles, similarTitles } from '@/lib/catalog';
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
import { titleEditorial } from '@/lib/editorial';
import { imgProxyUrl } from '@/lib/img';
import { episodeInfo } from '@/lib/episodes';
import { episodeDataFor, releasedCountFor, type EpisodeRow } from '@/lib/episode-data';
import { LegalWatchBlock } from '@/components/anime/LegalWatchBlock';
import { titleMetaDescription, titleWithYear } from '@/lib/text';
import { plural } from '@/lib/format';

/** meta/og/twitter description одной сборкой: 150–160 символов, обрезка по границе
    предложения (ТЗ 1.4). Раньше description обрывался на «…Мировым» посреди фразы. */
const metaDescription = (t: Title) =>
  titleMetaDescription({
    name: t.ru,
    year: t.year,
    genres: t.genres.slice(0, 3).map((g) => genreLabel(g).toLowerCase()),
    description: t.description || t.shikimori?.description || `Смотреть ${t.ru} онлайн: серии, озвучки, график выхода.`,
    tail: `Смотреть ${t.ru} онлайн на AniNova`,
  });

/* Аудит 2026-10 (ТЗ 2.2, инфраструктура): без generateStaticParams маршрут был
 * динамическим (в сборке — «ƒ /anime/[slug]»), поэтому `export const revalidate = 3600`
 * не применялся вовсе: Vercel отдавал страницу тайтла с cache-control: private, no-store
 * и x-vercel-cache: MISS на каждый запрос. Каждый просмотр = вызов serverless-функции
 * + парсинг 28 МБ titles.json.
 *
 * generateStaticParams возвращает НЕБОЛЬШОЙ набор самых популярных тайтлов, а
 * dynamicParams = true (по умолчанию) позволяет Next дорисовать любой другой slug
 * on-demand при первом запросе и положить его в ISR-кэш на revalidate. Так мы
 * получаем кэш края для всех 8000+ страниц, не раздувая сборку.
 *
 * Почему не предрендерить всё на сборке: замер в песочнице (1 ГБ RAM,
 * --max-old-space-size=700 из scripts/build.mjs) — 120 страниц тайтлов вместе с
 * генератором opengraph-image упираются в «Reached heap limit». На билд-машине
 * Vercel памяти больше, поэтому лимит вынесен в STATIC_TITLE_LIMIT и его можно
 * поднять там без правки кода. */
const STATIC_TITLE_LIMIT = Number(process.env.STATIC_TITLE_LIMIT ?? 120);

export function generateStaticParams() {
  if (STATIC_TITLE_LIMIT <= 0) return [];
  return loadTitles()
    .filter((t) => !t.hidden)
    .sort((a, b) => b.favourites - a.favourites || b.score - a.score)
    .slice(0, STATIC_TITLE_LIMIT)
    .map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = getTitle(slug);
  if (!t) notFound();
  const description = metaDescription(t);
  /* Год добавляем только если его ещё нет в названии: после разбора дублей
     (scripts/repair-catalog.mjs --fix-dupes) русское название уже содержит год,
     и прежний шаблон давал «Ван-Пис (1999) (1999) смотреть онлайн». */
  const name = titleWithYear(t.ru, t.year);
  const image = `/anime/${t.slug}/opengraph-image`;
  return {
    title: `${name} смотреть онлайн`,
    description,
    alternates: { canonical: `/anime/${t.slug}` },
    openGraph: {
      type: 'video.tv_show',
      url: `/anime/${t.slug}`,
      locale: 'ru_RU',
      siteName: 'AniNova',
      title: name,
      description,
      images: image,
    },
    /* ТЗ 1.5: twitter наследовал общие title/description из корня — задаём явно. */
    twitter: { card: 'summary_large_image', title: name, description, images: image },
  };
}

const MSK_DATE = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' });

/** Последние серии с датами: уникальная для каждого тайтла таблица (ТЗ 3.2.3). */
function EpisodeDatesBlock({ slug, rows, total }: { slug: string; rows: EpisodeRow[]; total: number | null }) {
  const withDates = rows.filter((r) => r.airedAt !== null).slice(-12).reverse();
  if (withDates.length < 2) return null;
  return (
    <section className="panel ep-dates" aria-label="Выход серий">
      <h2 className="section-title">Выход серий</h2>
      <p className="panel__note">
        Последние {withDates.length} {withDates.length === 1 ? 'серия' : 'серии'} из{' '}
        {total ? `${total}${rows.length > total ? '+' : ''}` : 'известных'} — с датами эфира по московскому времени.
      </p>
      <ul className="ep-dates__list">
        {withDates.map((r) => (
          <li key={r.number} className="ep-dates__row">
            <Link className="ep-dates__num" href={`/anime/${slug}/${r.number}`}>
              Серия {r.number}
            </Link>
            <span className="ep-dates__name">{r.name ?? `Серия ${r.number}`}</span>
            <span className="ep-dates__date">{r.airedAt ? MSK_DATE.format(r.airedAt) : 'дата уточняется'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = getTitle(slug);
  if (!title || title.hidden) notFound();
  const similar = similarTitles(title);
  /* ТЗ 1.2: число серий — из единого правила. У онгоинга без объявленного итога
     показываем «1134+ серий», у анонса — прочерк, а не выдуманную заглушку. */
  /* Задача 1 аудита: «вышло N» берём из БД (episode_progress / airing_progress /
     Shikimori episodes_aired в titles.episodes_released), а не из замороженного
     поля airing в titles.json — иначе у «Ван-Пис» список обрывался на 1134
     при реально вышедших 1180, а серии 1135…1180 отдавали 404. */
  const info = episodeInfo(title);
  const epsCount = await releasedCountFor(title);
  const eps = { ...info, released: epsCount };
  const epsLabel = epsCount === null ? null : `${epsCount}${info.totalUnknown ? '+' : ''} ${plural(epsCount, ['серия', 'серии', 'серий'])}`;
  /* ТЗ 4.1 (4.2): показываем одно основное описание; shikimori-вариант уходит
   * в сворачиваемый блок «Альтернативное описание» (по умолчанию свёрнут). */
  /* Редполитика (SEO-9): уникальная справка из данных каталога — повышает
     уникальность страницы поверх общего описания AniList/Shikimori. */
  /* ТЗ 1.3.5: «свежесть ленты» и названия серий — из таблицы `episodes`/`airing_schedule`,
     а не из устаревшего поля `airing` в titles.json. */
  const epData = await episodeDataFor(title);
  const ed = titleEditorial(title, {
    maxNumber: epData.maxNumber,
    lastAiredAt: epData.lastAiredAt,
    source: epData.source,
  });
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
    /* ТЗ 3.2.1: aggregateRating — только при реальной оценке. ratingCount раньше
       подставлялся из `favourites` (избранные ≠ число оценок): у «Ван-Пис» в разметке
       было ratingCount 109202 при том, что это счётчик избранного. Пока настоящего
       числа оценок в каталоге нет, поле не отдаём вовсе — Google допускает
       ratingValue без ratingCount, а ложное число ломает доверие к разметке. */
    ...(title.score > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: title.score,
            bestRating: 10,
            worstRating: 1,
            ...(title.ratingCount ? { ratingCount: title.ratingCount } : {}),
          },
        }
      : {}),
    genre: title.genres.slice(0, 5),
    /* ТЗ 1.2: numberOfEpisodes — только подтверждённый итог. Раньше в разметку
       уходила заглушка 24 у «Ван-Пис» и 12 у анонсов: Google видел ложные факты. */
    ...(title.type !== 'movie' && eps.total
      ? { numberOfSeasons: 1, numberOfEpisodes: eps.total, containsSeason: { '@type': 'TVSeason', numberOfEpisodes: eps.total, seasonNumber: 1 } }
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
              <WatchButton slug={title.slug} episodes={epsCount} type={title.type} />
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
                <dd>{epsLabel ?? '—'}</dd>
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
          <section className="panel editorial" aria-label="Справка AniNova по тайтлу">
            <h2 className="section-title">{ed.heading}</h2>
            {ed.paragraphs.map((p, i) => (
              <p key={i} className="editorial__p">
                {p}
              </p>
            ))}
            {ed.links.length ? (
              <p className="editorial__links">
                Смотрите также:{' '}
                {ed.links.map((l, i) => (
                  <span key={l.href}>
                    {i ? ', ' : ''}
                    <Link href={l.href}>{l.name}</Link>
                  </span>
                ))}
              </p>
            ) : null}
          </section>
          {/* ТЗ 3.2.3: уникальный контент страницы из РЕАЛЬНЫХ данных — последние серии
              с настоящими названиями и датами эфира (таблица `episodes`, воркер
              sync-episodes). Раньше блок «Об этом тайтле» был шаблонным на весь каталог,
              а названия серий отсутствовали вовсе. */}
          {epData.rows.length ? <EpisodeDatesBlock slug={title.slug} rows={epData.rows} total={epsCount} /> : null}

          {epsCount !== null && epsCount > 1 ? (
            <section aria-label="Серии">
              <EpisodeList title={title} />
            </section>
          ) : null}
        </div>

        <div className="detail-extra">
          <LegalWatchBlock title={title} />
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
            <EpisodeGuide title={title} data={epData} />
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
