import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { demoChapters, findDemoComic } from '@/lib/aninova3/comics-demo';
import { CATALOG_ROLE_LABELS } from '@/lib/aninova3/comics/catalog';
import {
  ComicsCatalogUnavailableError,
  readComicBySlug,
  type ComicBySlugRead,
} from '@/lib/aninova3/comics/public-catalog';
import { COMIC_KIND_LABELS, COMIC_STATUS_LABELS } from '@/lib/aninova3/comics/model';
import {
  canOpenReader,
  chaptersLine,
  comicDisplayTitle,
  isPublishableEntry,
  publicAuthors,
  publicRuChapters,
  publicationSummary,
  volumeLine,
} from '@/lib/aninova3/comics/publication';
import { A3Cover } from '@/components/aninova3/A3Cover';
import { A3AdaptationSection } from '@/components/aninova3/comics/A3AdaptationSection';
import { PosterArt } from '@/components/anime/PosterArt';
import { IconChevronRight } from '@/components/ui/icons';

const ROOT = '/preview/aninova-3';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const demo = findDemoComic(slug);
  if (demo) return { title: demo.title, robots: { index: false, follow: false } };
  try {
    const read = await readComicBySlug(slug);
    if (read.status === 'found') {
      return { title: comicDisplayTitle(read.entry.comic).text, robots: { index: false, follow: false } };
    }
  } catch {
    /* Метаданные не должны падать из-за недоступной БД — страница покажет состояние. */
  }
  return { title: 'Комикс не найден', robots: { index: false, follow: false } };
}

export default async function A3ComicPage({ params }: Props) {
  const { slug } = await params;
  const demo = findDemoComic(slug);
  if (demo) return <DemoComicPage slug={slug} />;

  let read: ComicBySlugRead;
  try {
    read = await readComicBySlug(slug);
  } catch (error) {
    if (error instanceof ComicsCatalogUnavailableError) return <ComicUnavailable reason={error.message} />;
    throw error;
  }

  if (read.status === 'moved') redirect(`${ROOT}/comics/${read.slug}`);
  if (read.status === 'not-found') notFound();

  const { comic } = read.entry;
  const role = read.entry.role;
  const adaptations = read.adaptations;
  const ruChapters = publicRuChapters(comic);
  const readable = canOpenReader(comic);
  const publishable = isPublishableEntry(comic);
  const title = comicDisplayTitle(comic);
  const authors = publicAuthors(comic);

  return (
    <article className="a3-wrap a3-comic a3-comic--source">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={`${ROOT}/comics`}>Комиксы</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{title.text}</span>
      </nav>

      {read.notice ? (
        <p className="a3-demo-note" role="status">
          {read.notice.message}
        </p>
      ) : null}

      <header className="a3-comic__hero">
        <div className="a3-comic__cover">
          <PosterArt
            src={comic.cover}
            seed={comic.slug}
            initials={title.text.slice(0, 1)}
            alt={`Обложка: ${title.text}`}
            width={240}
            eager
          />
        </div>
        <div className="a3-comic__info">
          <p className="a3-kicker">
            {CATALOG_ROLE_LABELS[role]} · {COMIC_KIND_LABELS[comic.kind]} ·{' '}
            {comic.year ?? 'год уточняется'} · {COMIC_STATUS_LABELS[comic.status]}
          </p>
          <h1 className="a3-h1">{title.text}</h1>
          {title.pending ? (
            <p className="a3-muted">Подтверждённая связь с аниме есть, но русскоязычное издание пока не сверено.</p>
          ) : comic.verification === 'SOURCE_VERIFIED' ? (
            <p className="a3-muted">
              {comic.publication.rightsVerified
                ? 'Название и метаданные сверены с источником; права на публикацию глав подтверждены отдельно.'
                : 'Название и метаданные прошли публичный гейт каталога. Права на публикацию глав не подтверждены.'}
            </p>
          ) : null}
          {/* Лицензионное название источника публично не выводится: официального
              подтверждения издателя нет (officialPublisherConfirmed = false), а сама
              заявка часто содержит иностранное написание. Данные остаются внутренними. */}
          {/* Оригинальное (иностранное) название публично не выводится ни в каком виде:
              оно остаётся во внутренних данных для сопоставления и сверки. */}
          {authors.length ? <p className="a3-comic__authors">{authors.join(', ')}</p> : null}
          {comic.genres.length ? (
            <div className="a3-chips a3-chips--inline">
              {comic.genres.slice(0, 6).map((genre) => (
                <Link
                  key={genre}
                  className="a3-chip a3-chip--sm"
                  href={`${ROOT}/comics?genre=${encodeURIComponent(genre)}`}
                  data-a3-focusable
                >
                  {genre}
                </Link>
              ))}
            </div>
          ) : null}
          {comic.descriptionRu ? <p className="a3-prose">{comic.descriptionRu}</p> : null}
          <div className="a3-comic__facts">
            <span>{chaptersLine(comic)}</span>
            {volumeLine(comic) ? <span>{volumeLine(comic)}</span> : null}
            {comic.metadata?.sourceUrl ? (
              <span>
                Метаданные:{' '}
                <a className="a3-link" href={comic.metadata.sourceUrl} rel="nofollow noopener noreferrer" target="_blank">
                  источник
                </a>
              </span>
            ) : null}
            <span>Права: {comic.publication.rightsVerified ? 'подтверждены' : 'не подтверждены'}</span>
          </div>
          {readable ? (
            <div className="a3-comic__actions">
              <Link
                className="a3-btn a3-btn--primary a3-btn--lg"
                href={`${ROOT}/comics/${comic.slug}/read?chapter=${ruChapters[0].number}`}
                data-a3-focusable
              >
                Читать с главы {ruChapters[0].number}
              </Link>
            </div>
          ) : (
            <div className="a3-publication-state" role="status">
              <strong>Публикация недоступна.</strong>
              <span>{publicationSummary(comic)}.</span>
              <span>
                {publishable
                  ? 'Карточка показывает подтверждённый первоисточник, но не обещает чтение.'
                  : 'Произведение закрыто и не показывается в каталоге.'}
              </span>
            </div>
          )}
        </div>
      </header>

      <A3AdaptationSection links={adaptations} />

      {ruChapters.length ? (
        <section className="a3-comic__chapters" aria-labelledby="a3-chapters">
          <div className="a3-section__head a3-section__head--inline">
            <h2 className="a3-h2" id="a3-chapters">
              Русские главы
            </h2>
            <p className="a3-muted">Только подтверждённые русские главы</p>
          </div>
          <ol className="a3-chapterlist">
            {ruChapters.map((ch) => (
              <li key={ch.id}>
                {readable ? (
                  <Link
                    className="a3-chapter"
                    href={`${ROOT}/comics/${comic.slug}/read?chapter=${ch.number}`}
                    data-a3-focusable
                  >
                    <span className="a3-chapter__num">{ch.number}</span>
                    <span className="a3-chapter__title">{ch.titleRu}</span>
                    <span className="a3-muted">{ch.publishedAt ?? ''}</span>
                    <IconChevronRight size={16} />
                  </Link>
                ) : ch.readingUrl ? (
                  /* Официальная ссылка из БД: не читалка, но и не выдуманный источник. */
                  <a
                    className="a3-chapter"
                    href={ch.readingUrl}
                    rel="nofollow noopener noreferrer"
                    target="_blank"
                    data-a3-focusable
                  >
                    <span className="a3-chapter__num">{ch.number}</span>
                    <span className="a3-chapter__title">{ch.titleRu}</span>
                    <span className="a3-muted">{ch.sourceName ? `Официальный источник: ${ch.sourceName}` : 'Официальный источник'}</span>
                    <IconChevronRight size={16} />
                  </a>
                ) : (
                  <span className="a3-chapter a3-chapter--static">
                    <span className="a3-chapter__num">{ch.number}</span>
                    <span className="a3-chapter__title">{ch.titleRu}</span>
                    <span className="a3-muted">чтение закрыто</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}

function ComicUnavailable({ reason }: { reason: string }) {
  return (
    <div className="a3-wrap">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={`${ROOT}/comics`}>Комиксы</Link>
      </nav>
      <h1 className="a3-h1">Карточка недоступна</h1>
      <div className="a3-publication-state" role="alert">
        <strong>Причина:</strong>
        <span>{reason}</span>
      </div>
    </div>
  );
}

function DemoComicPage({ slug }: { slug: string }) {
  const comic = findDemoComic(slug);
  if (!comic) notFound();
  const chapters = demoChapters(comic);
  const first = chapters[0];

  return (
    <article className="a3-wrap a3-comic">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={`${ROOT}/comics`}>Комиксы</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{comic.title}</span>
      </nav>

      <header className="a3-comic__hero">
        <A3Cover comic={comic} size="lg" />
        <div className="a3-comic__info">
          <p className="a3-kicker">
            {comic.status} · {comic.year} · только на русском
          </p>
          <h1 className="a3-h1">{comic.title}</h1>
          <p className="a3-comic__sub">{comic.subtitle}</p>
          <p className="a3-prose">{comic.description}</p>
          <div className="a3-chips a3-chips--inline">
            {comic.genres.map((g) => (
              <Link key={g} className="a3-chip a3-chip--sm" href={`${ROOT}/comics?genre=${encodeURIComponent(g)}`}>
                {g}
              </Link>
            ))}
          </div>
          <div className="a3-comic__actions">
            <Link className="a3-btn a3-btn--primary a3-btn--lg" href={`${ROOT}/comics/${comic.slug}/read?chapter=${first.number}`}>
              Читать с главы {first.number}
            </Link>
            <span className="a3-muted">{comic.chapters} глав · демо</span>
          </div>
          <p className="a3-demo-note">
            Демонстрационные данные: реальные главы, перевод и права не подключены. Публичный каталог требует русского названия и русских глав.
          </p>
        </div>
      </header>

      <section className="a3-comic__chapters" aria-labelledby="a3-chapters">
        <div className="a3-section__head a3-section__head--inline">
          <h2 className="a3-h2" id="a3-chapters">
            Главы
          </h2>
          <p className="a3-muted">Последние сверху</p>
        </div>
        <ol className="a3-chapterlist">
          {chapters.map((ch) => (
            <li key={ch.number}>
              <Link className="a3-chapter" href={`${ROOT}/comics/${comic.slug}/read?chapter=${ch.number}`} data-a3-focusable>
                <span className="a3-chapter__num">{ch.number}</span>
                <span className="a3-chapter__title">{ch.title}</span>
                <span className="a3-muted">{ch.date}</span>
                <IconChevronRight size={16} />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
