import type { Metadata } from 'next';
import Link from 'next/link';
import { COLLECTIONS, collectionTitles } from '@/lib/collections';
import { loadTitles } from '@/lib/catalog';
import { PosterArt } from '@/components/anime/PosterArt';
import { plural } from '@/lib/format';
import { PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';
import { previewPublicTitle } from '@/lib/aninova3/public-title';

export const metadata: Metadata = {
  title: 'Подборки аниме',
  description: 'Курированные подборки каталога AniNova: под настроение, длину и опыт просмотра.',
  robots: { index: false, follow: false },
  alternates: { canonical: `${PREVIEW_ROOT}/collections` },
};

export default function PreviewCollectionsPage() {
  const all = loadTitles();
  return (
    <div className="a3-wrap a3-utility">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={PREVIEW_ROOT}>Главная</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Подборки</span>
      </nav>
      <header className="a3-pagehead">
        <p className="a3-kicker">Выбор редакции</p>
        <h1 className="a3-h1">Подборки аниме</h1>
        <p className="a3-pagehead__lead">Готовые коллекции каталога — без выдуманных тайтлов и ручных рейтингов.</p>
      </header>
      <div className="a3-collections-grid">
        {COLLECTIONS.map((c) => {
          const res = collectionTitles(c.slug, all);
          const preview = res?.items.slice(0, 3) ?? [];
          return (
            <article className="a3-collection-card" key={c.slug}>
              <h2><Link href={`${PREVIEW_ROOT}/collections/${c.slug}`}>{c.title}</Link></h2>
              <p>{c.desc}</p>
              <p className="a3-muted">
                {res?.items.length ?? 0} {plural(res?.items.length ?? 0, ['тайтл', 'тайтла', 'тайтлов'])} в подборке.
              </p>
              <div className="a3-collection-card__posters">
                {preview.map((t) => (
                  <Link key={t.slug} href={`${PREVIEW_ROOT}/anime/${t.slug}`} aria-label={previewPublicTitle(t.ru)}>
                    <PosterArt src={t.poster} seed={t.slug} initials={previewPublicTitle(t.ru).slice(0, 1)} alt="" width={68} />
                  </Link>
                ))}
              </div>
              <Link className="a3-link" href={`${PREVIEW_ROOT}/collections/${c.slug}`}>Открыть подборку →</Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
