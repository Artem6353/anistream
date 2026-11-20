import type { Metadata } from 'next';
import Link from 'next/link';
import { getTitle, heroSlides, homeRails, loadTitles, toCardTitle } from '@/lib/catalog';
import { A3Hero } from '@/components/aninova3/A3Hero';
import { A3Rail } from '@/components/aninova3/A3Rail';
import { A3Card } from '@/components/aninova3/A3Card';
import { A3Continue } from '@/components/aninova3/A3Continue';
import { DEMO_COMICS } from '@/lib/aninova3/comics-demo';

export const metadata: Metadata = { title: 'Главная' };

export default function A3HomePage() {
  const featured = heroSlides()[0] ?? loadTitles()[0];
  const rails = homeRails();
  const title = featured ? getTitle(featured.slug) ?? featured : null;

  return (
    <>
      {title ? <A3Hero title={title} /> : null}

      <A3Continue />

      <A3Rail
        title="Сейчас популярно"
        action={{ href: '/preview/aninova-3/catalog?sort=pop', label: 'Весь каталог' }}
        description="Реальные данные каталога: популярность по избранному и рейтингу."
      >
        {rails.popular.map((t) => (
          <A3Card key={t.slug} title={toCardTitle(t)} />
        ))}
      </A3Rail>

      <section className="a3-section" data-a3-group="comics">
        <div className="a3-wrap">
          <div className="a3-comics-teaser">
            <div className="a3-comics-teaser__copy">
              <p className="a3-kicker">Comics · только на русском</p>
              <h2 className="a3-h2">Читать, а не листать</h2>
              <p className="a3-muted">
                Отдельный каталог комиксов: плотный список, крупная обложка, спокойная читалка. Русские названия и главы — обязательное правило домена.
              </p>
              <p className="a3-demo-note">Демонстрационные произведения: реальные главы и права ещё не подключены.</p>
              <Link className="a3-btn a3-btn--primary" href="/preview/aninova-3/comics">
                Открыть Comics
              </Link>
            </div>
            <div className="a3-comics-teaser__covers" aria-hidden>
              {DEMO_COMICS.slice(0, 3).map((c) => (
                <span key={c.slug} className="a3-cover a3-cover--sm" style={{ '--cover-tone': c.tone } as React.CSSProperties}>
                  <span className="a3-cover__mark">демо</span>
                  <span className="a3-cover__title">{c.title}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <A3Rail title="Новинки" action={{ href: '/preview/aninova-3/catalog?sort=new', label: 'Все новинки' }}>
        {rails.fresh.map((t) => (
          <A3Card key={t.slug} title={toCardTitle(t)} />
        ))}
      </A3Rail>

      <A3Rail title="Фильмы" action={{ href: '/preview/aninova-3/catalog?type=movie&sort=score', label: 'Все фильмы' }}>
        {rails.movies.map((t) => (
          <A3Card key={t.slug} title={toCardTitle(t)} />
        ))}
      </A3Rail>

      {rails.upcoming.length ? (
        <A3Rail title="Анонсы" action={{ href: '/preview/aninova-3/catalog?status=upcoming', label: 'Все анонсы' }}>
          {rails.upcoming.map((t) => (
            <A3Card key={t.slug} title={toCardTitle(t)} />
          ))}
        </A3Rail>
      ) : null}

      <section className="a3-section">
        <div className="a3-wrap a3-note">
          <p>
            <strong>B1-B preview.</strong> Гибрид A+C: каталог и формы — от A, афиша и сцена — от C. Интерфейс включён только флагом{' '}
            <code>ANINOVA3_PREVIEW=1</code>. <Link href="/">Текущий сайт</Link> не изменён.
          </p>
        </div>
      </section>
    </>
  );
}
