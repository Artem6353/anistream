import type { Metadata } from 'next';
import Link from 'next/link';
import { topTitles } from '@/lib/catalog';
import { TYPE_LABELS } from '@/lib/labels';
import { PosterArt } from '@/components/anime/PosterArt';
import { IconStar } from '@/components/ui/icons';
import { PREVIEW_ROOT } from '@/lib/aninova3/preview-auth';
import { previewTitle } from '@/lib/aninova3/public-title';

export const metadata: Metadata = {
  title: 'ТОП-250 аниме по оценкам',
  description: 'Топ-250 аниме каталога AniNova по средним оценкам. Реальные рейтинги, годы и число серий.',
  robots: { index: false, follow: false },
  alternates: { canonical: `${PREVIEW_ROOT}/top` },
};

export default function PreviewTopPage() {
  const top = topTitles(250).map(previewTitle);
  const avg = top.length ? top.reduce((sum, t) => sum + t.score, 0) / top.length : 0;
  return (
    <div className="a3-wrap a3-utility">
      <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
        <Link href={PREVIEW_ROOT}>Главная</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">ТОП-250</span>
      </nav>
      <header className="a3-pagehead">
        <p className="a3-kicker">Рейтинг каталога</p>
        <h1 className="a3-h1">ТОП-250 аниме</h1>
        <p className="a3-pagehead__lead">
          Лучшие тайтлы по средним оценкам каталога. {top.length ? `Средний балл списка — ${avg.toFixed(1)}.` : null}
        </p>
      </header>

      {top.length ? (
        <ol className="a3-toplist">
          {top.map((t, i) => (
            <li className="a3-toplist__item" key={t.slug}>
              <span className={`a3-toplist__rank${i < 3 ? ' is-top' : ''}`} aria-hidden="true">{i + 1}</span>
              <Link className="a3-toplist__art" href={`${PREVIEW_ROOT}/anime/${t.slug}`} tabIndex={-1} aria-hidden="true">
                <PosterArt src={t.poster} seed={t.slug} initials={t.ru || '?'} alt="" width={56} />
              </Link>
              <div className="a3-toplist__body">
                <h2 className="a3-toplist__title"><Link href={`${PREVIEW_ROOT}/anime/${t.slug}`}>{t.ru}</Link></h2>
                <p className="a3-toplist__meta">
                  {t.year} · {TYPE_LABELS[t.type] ?? t.type}
                  {t.episodes ? ` · ${t.episodes} сер.` : ''}
                  {t.favourites ? ` · ${t.favourites.toLocaleString('ru-RU')} в избранном` : ''}
                </p>
              </div>
              <span className="a3-toplist__score" aria-label={`Рейтинг ${t.score.toFixed(1)}`}>
                <IconStar size={13} /> {t.score.toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="a3-empty">
          <h2 className="a3-empty__title">Рейтинг пока пуст</h2>
          <p className="a3-muted">В каталоге ещё нет оценённых тайтлов.</p>
          <Link className="a3-link" href={`${PREVIEW_ROOT}/catalog`}>Открыть каталог →</Link>
        </div>
      )}
    </div>
  );
}
