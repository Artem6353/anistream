import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { demoChapters, findDemoComic } from '@/lib/aninova3/comics-demo';
import { A3Cover } from '@/components/aninova3/A3Cover';
import { IconChevronRight } from '@/components/ui/icons';

const ROOT = '/preview/aninova-3';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const comic = findDemoComic(slug);
  return { title: comic ? comic.title : 'Комикс не найден', robots: { index: false, follow: false } };
}

export default async function A3ComicPage({ params }: Props) {
  const { slug } = await params;
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
