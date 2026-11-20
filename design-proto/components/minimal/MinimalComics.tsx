import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { comics, getComic } from '@/lib/mock';

export function MinimalComics() {
  const reading = getComic('steklyannyj-gorod');
  const chapters = [
    { comic: comics[2], n: 24, title: 'Слой третий', date: 'сегодня' },
    { comic: comics[0], n: 42, title: 'Свет выключили', date: 'вчера' },
    { comic: comics[3], n: 9, title: 'Плёнка горит', date: '4 дня назад' },
  ];

  return (
    <div className="m-wrap">
      <div className="m-comics">
        <header className="m-comics-head">
          <div>
            <h1 className="m-title-page">Комиксы</h1>
            <p className="m-page-note">Оригиналы и переводы · только на русском · 6 демо-тайтлов</p>
          </div>
          <span className="m-pill m-pill--ok">
            <Pulse size={5} /> RU-only
          </span>
        </header>

        <article className="m-continue-read">
          <Image src={reading.cover} alt={`Обложка: ${reading.title}`} width={88} height={132} sizes="88px" />
          <div>
            <span className="m-feature-label">Продолжить чтение</span>
            <h2 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{reading.title}</h2>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
              Глава {reading.progress?.chapter} · страница {reading.progress?.page} из {reading.progress?.pages} ·{' '}
              {reading.author}
            </p>
            <div className="m-progress" style={{ margin: '10px 0 12px' }}>
              <span
                style={{
                  width: `${Math.round(((reading.progress?.page ?? 0) / (reading.progress?.pages ?? 1)) * 100)}%`,
                }}
              />
            </div>
            <Link className="m-btn m-btn--primary m-btn--sm" href={`/minimal/comics/${reading.slug}/read`}>
              Продолжить <Icon name="arrow" size={14} />
            </Link>
          </div>
        </article>

        <section style={{ marginTop: 28 }} aria-labelledby="m-comics-all">
          <div className="m-section-head">
            <h2 className="m-h2" id="m-comics-all">
              Все комиксы
            </h2>
            <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>обновлено сегодня</span>
          </div>
          <div className="m-comic-grid">
            {comics.map((c) => (
              <Link key={c.slug} className="m-comic-card" href={`/minimal/comics/${c.slug}`}>
                <Image className="m-comic-cover" src={c.cover} alt={`Обложка: ${c.title}`} width={220} height={330} sizes="(max-width: 768px) 45vw, (max-width: 1200px) 30vw, 220px" />
                <span className="m-comic-card-title">{c.title}</span>
                <span className="m-comic-card-meta">
                  {c.chapters} глав · {c.status}
                </span>
                <span className="m-comic-card-meta">{c.genres.join(' · ')}</span>
              </Link>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 32 }} aria-labelledby="m-comics-new">
          <div className="m-section-head">
            <h2 className="m-h2" id="m-comics-new">
              Новые главы
            </h2>
          </div>
          <div>
            {chapters.map((c) => (
              <Link key={`${c.comic.slug}-${c.n}`} className="m-chapter-row" href={`/minimal/comics/${c.comic.slug}/read`}>
                <span>
                  <span className="m-row-title" style={{ fontSize: 13.5 }}>
                    {c.comic.title}
                  </span>
                  <span className="m-row-meta">
                    <span>Глава {c.n}</span>
                    <span>{c.title}</span>
                  </span>
                </span>
                <span className="m-new-badge">new</span>
                <span className="m-hist-when">{c.date}</span>
              </Link>
            ))}
          </div>
          <p className="m-demo-note">
            В прототипе нет реальных глав: читалка открывает четыре демонстрационные страницы. Проверяется только
            интерфейс чтения.
          </p>
        </section>
      </div>
    </div>
  );
}
