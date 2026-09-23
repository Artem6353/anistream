import Link from 'next/link';
import type { Title } from '@/lib/types';
import { TYPE_LABELS, genreLabel } from '@/lib/labels';
import { PosterArt } from './PosterArt';
import { BookmarkButton } from './BookmarkButton';

/** Строка-карточка списка каталога (вид «списком», как на AnimeGO). */
export function PosterRow({ title }: { title: Title }) {
  return (
    <article className="row">
      <Link className="row__poster" href={`/anime/${title.slug}`} aria-label={title.ru}>
        <PosterArt src={title.poster} seed={title.slug} initials={title.romaji} alt={`Постер: ${title.ru}`} />
      </Link>
      <div className="row__body">
        <h3 className="row__title">
          <Link href={`/anime/${title.slug}`}>{title.ru}</Link>
        </h3>
        <p className="row__orig">{title.romaji}</p>
        <p className="row__meta">
          <span>{TYPE_LABELS[title.type]}</span>
          <span>{title.year}</span>
          {title.score > 0 ? <span className="row__score">★ {title.score.toFixed(1)}</span> : null}
          <span>{title.episodes} сер.</span>
          <span className="row__genres">{title.genres.slice(0, 4).map((g) => genreLabel(g)).join(', ')}</span>
        </p>
        {title.description ? <p className="row__desc">{title.description.slice(0, 220)}…</p> : null}
      </div>
      <BookmarkButton slug={title.slug} className="row__bookmark" />
    </article>
  );
}
