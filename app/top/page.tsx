import type { Metadata } from 'next';
import Link from 'next/link';
import { topTitles } from '@/lib/catalog';
import { TYPE_LABELS } from '@/lib/labels';
import { PosterArt } from '@/components/anime/PosterArt';

export const revalidate = 3600;
export const metadata: Metadata = {
  title: 'ТОП-250',
  description: 'Топ-250 аниме по оценке AniList: сериалы и полнометражки с описаниями.',
};

export default function TopPage() {
  const top = topTitles(250);
  const avg = top.length ? top.reduce((a, t) => a + t.score, 0) / top.length : 0;

  return (
    <div className="container top-layout">
      <div className="top-main">
        <header className="page-head">
          <h1>ТОП-250 аниме</h1>
          <p>Лучшие тайтлы каталога по средним оценкам AniList.</p>
        </header>
        <ol className="toplist">
          {top.map((t, i) => (
            <li key={t.slug} className="toplist__item">
              <span className={`toplist__num ${i < 3 ? `toplist__num--${i + 1}` : ''}`}>{i + 1}</span>
              <Link className="toplist__poster" href={`/anime/${t.slug}`}>
                <PosterArt src={t.poster} seed={t.slug} initials={t.romaji} alt="" />
              </Link>
              <div className="toplist__body">
                <h3>
                  <Link href={`/anime/${t.slug}`}>{t.ru}</Link>
                </h3>
                <p className="toplist__orig">{t.romaji}</p>
                <p className="row__meta">
                  <span className="row__score">★ {t.score.toFixed(1)}</span>
                  <span>{t.favourites.toLocaleString('ru-RU')} в избранном</span>
                  <span>{TYPE_LABELS[t.type]}</span>
                  <span>{t.year}</span>
                </p>
                {t.description ? <p className="row__desc">{t.description.slice(0, 180)}…</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <aside className="catalog-side">
        <div className="panel top-stats">
          <h2 className="section-title">Статистика ТОП-250</h2>
          <p className="top-stats__row">
            <span>Средняя оценка</span>
            <strong>★ {avg.toFixed(1)}</strong>
          </p>
          <p className="top-stats__row">
            <span>Тайтлов</span>
            <strong>{top.length}</strong>
          </p>
          <p className="top-stats__row">
            <span>Лидер</span>
            <strong>
              <Link href={`/anime/${top[0]?.slug}`}>{top[0]?.ru}</Link>
            </strong>
          </p>
        </div>
      </aside>
    </div>
  );
}
