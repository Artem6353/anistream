import Link from 'next/link';
import type { LinkedComic } from '@/lib/aninova3/comics/model';
import {
  COMIC_KIND_LABELS,
  COMIC_STATUS_LABELS,
  animeSideRoleLabel,
  sourceSectionDescription,
  sourceSectionState,
  sourceSectionTitle,
} from '@/lib/aninova3/comics/model';
import {
  canOpenReader,
  chaptersLine,
  comicDisplayTitle,
  hasReaderSource,
  isPubliclyReadable,
  isPublishableEntry,
  pluralRu,
  publicRuChapters,
  publicationSummary,
} from '@/lib/aninova3/comics/publication';
import { PosterArt } from '@/components/anime/PosterArt';

const ROOT = '/preview/aninova-3';

/**
 * Карточка оригинального произведения.
 *
 * Показывает только проверенное: русское название — при редакционном подтверждении
 * (иначе нейтральный текст без оригинального названия), автора — при подтверждении,
 * главы — только реально доступные. Кнопка чтения появляется исключительно при
 * полном прохождении публикационных проверок.
 */
export function A3SourceCard({ link }: { link: LinkedComic }) {
  const { comic, role } = link;
  const readable = canOpenReader(comic);
  const rightsOk = isPubliclyReadable(comic);
  const ruChapters = publicRuChapters(comic);
  const title = comicDisplayTitle(comic);
  const href = `${ROOT}/comics/${comic.slug}`;
  const publishable = isPublishableEntry(comic);
  /* Направление связи подтверждено только тогда, когда это можно утверждать. */
  const directionConfirmed = link.confidence === 'confirmed';
  const meta = [comic.authorsVerified ? comic.authors.join(', ') : null, comic.year, COMIC_KIND_LABELS[comic.kind]]
    .filter(Boolean)
    .join(' · ');

  return (
    <article
      className={`a3-source-card${readable ? ' is-readable' : ' is-unavailable'}${link.primary ? ' is-primary' : ''}`}
    >
      {publishable ? (
        <Link
          className="a3-source-card__cover"
          href={href}
          data-a3-focusable
          data-a3-key={`comic:${comic.id}`}
          aria-label={title.pending ? 'Подробнее о связанном произведении' : `${title.text}: подробнее`}
        >
          <PosterArt
            src={comic.cover}
            seed={comic.slug}
            initials={title.pending ? '•' : title.text.slice(0, 1)}
            alt={title.pending ? 'Обложка связанного произведения' : `Обложка: ${title.text}`}
            width={180}
          />
        </Link>
      ) : (
        <span className="a3-source-card__cover" aria-hidden>
          <PosterArt src={comic.cover} seed={comic.slug} initials="•" alt="" width={180} />
        </span>
      )}

      <div className="a3-source-card__body">
        <p className="a3-source-card__role">{animeSideRoleLabel(link)}</p>
        <h3 className={`a3-source-card__title${title.pending ? ' is-pending' : ''}`}>
          {publishable && !title.pending ? (
            <Link href={href} data-a3-focusable data-a3-key={`comic:${comic.id}:title`}>
              {title.text}
            </Link>
          ) : title.pending ? (
            <span>{title.text}</span>
          ) : (
            title.text
          )}
        </h3>
        {title.pending ? (
          <p className="a3-source-card__meta">Русское издание ещё не сверено редакцией.</p>
        ) : null}
        <p className="a3-source-card__meta">{meta}</p>
        <p className="a3-source-card__meta">{COMIC_STATUS_LABELS[comic.status]}</p>
        <p className="a3-source-card__chapters">{chaptersLine(comic)}</p>

        {readable ? (
          <>
            <p className="a3-source-card__chapters a3-source-card__chapters--ok">
              Доступно к чтению: {ruChapters.length} {pluralRu(ruChapters.length, ['глава', 'главы', 'глав'])} на русском
            </p>
            <Link
              className="a3-btn a3-btn--primary a3-source-card__cta"
              href={`${ROOT}/comics/${comic.slug}/read?chapter=${ruChapters[0].number}`}
              data-a3-focusable
            >
              Читать мангу
            </Link>
          </>
        ) : rightsOk && !hasReaderSource(comic) ? (
          <p className="a3-source-card__reason" role="note">
            Публикация разрешена, но страницы глав ещё не подключены: читалка откроется после подключения
            разрешённых русских глав.
          </p>
        ) : (
          <p className="a3-source-card__reason" role="note">
            {role === 'SOURCE' && directionConfirmed
              ? 'Первоисточник установлен, публикация пока недоступна: '
              : 'Публикация пока недоступна: '}
            {publicationSummary(comic)}.
          </p>
        )}

        {!readable && publishable ? (
          <Link className="a3-link" href={href} data-a3-focusable>
            {role === 'SOURCE' && directionConfirmed ? 'О первоисточнике' : 'Подробнее о произведении'} →
          </Link>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Секция связей на странице аниме: после сведений и серий, до рекомендаций.
 *
 * Заголовок говорит ровно то, что известно: «Первоисточник» — когда направление
 * подтверждено, «Вероятный первоисточник» — когда оно определено только по датам,
 * «Связанные комиксы» — когда не известно. Связи при этом показываются всегда.
 */
export function A3SourceSection({ links }: { links: LinkedComic[] }) {
  if (!links.length) return null;
  const title = sourceSectionTitle(sourceSectionState(links));
  const description = sourceSectionDescription(links);
  const multi = links.length > 1;
  return (
    <section className="a3-source-section" aria-labelledby="a3-source-title">
      <div className="a3-section__head a3-section__head--inline">
        <div>
          <h2 className="a3-h2" id="a3-source-title">
            {title}
          </h2>
          <p className="a3-muted a3-section__desc">{description}</p>
        </div>
      </div>
      <div className={`a3-source-grid${multi ? ' a3-source-grid--multi' : ''}`}>
        {links.map((link) => (
          <A3SourceCard key={link.comic.id} link={link} />
        ))}
      </div>
    </section>
  );
}
