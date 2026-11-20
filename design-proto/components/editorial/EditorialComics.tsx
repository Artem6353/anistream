import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { comics, getComic } from '@/lib/mock';

export function EditorialComics() {
  const feature = getComic('steklyannyj-gorod');
  const fresh = [
    { comic: comics[2], n: 24, title: 'Слой третий', date: '20.11.2026', pages: 18 },
    { comic: comics[0], n: 42, title: 'Свет выключили', date: '19.11.2026', pages: 24 },
    { comic: comics[3], n: 9, title: 'Плёнка горит', date: '16.11.2026', pages: 16 },
    { comic: comics[1], n: 18, title: 'Один градус', date: '14.11.2026', pages: 21 },
  ];

  return (
    <div className="e-wrap">
      <div className="e-comics">
        <header className="e-comics-head">
          <span className="e-label">
            <Pulse size={5} /> Рубрика · только русский язык
          </span>
          <h1>Комиксы</h1>
          <p>
            Оригиналы и переводы, которые не нужно ждать: шесть демонстрационных историй, шесть разных способов
            рассказать одну и ту же осень.
          </p>
        </header>

        <article className="e-feature-comic">
          <Link href={`/editorial/comics/${feature.slug}`} aria-label={feature.title}>
            <Image
              src={feature.cover}
              alt={`Обложка: ${feature.title}`}
              width={600}
              height={800}
              sizes="(max-width: 768px) 100vw, 300px"
              priority
            />
          </Link>
          <div>
            <span className="e-label">Обложка выпуска · глава {feature.progress?.chapter}</span>
            <h2>
              <Link href={`/editorial/comics/${feature.slug}`}>{feature.title}</Link>
            </h2>
            <p>{feature.synopsis}</p>
            <p className="e-byline">
              <b>{feature.author}</b>
              <span>художник {feature.artist}</span>
              <span>{feature.chapters} глав</span>
              <span>{feature.rated}</span>
            </p>
            <div className="e-continue-line">
              <span>Продолжить с</span>
              <b>
                глава {feature.progress?.chapter}, стр. {feature.progress?.page}
              </b>
              <Link className="e-textlink" href={`/editorial/comics/${feature.slug}/read`}>
                Читать <Icon name="arrow" size={12} />
              </Link>
            </div>
            <div className="e-lead-actions">
              <Link className="e-btn e-btn--solid" href={`/editorial/comics/${feature.slug}`}>
                Страница комикса
              </Link>
            </div>
          </div>
        </article>

        <section className="e-block" aria-labelledby="e-fresh-h">
          <div className="e-block-head">
            <h2 id="e-fresh-h">Новые главы</h2>
            <span className="e-label">обновлено сегодня</span>
          </div>
          <div className="e-chapter-list">
            {fresh.map((f) => (
              <Link key={`${f.comic.slug}-${f.n}`} className="e-chapter-row" href={`/editorial/comics/${f.comic.slug}/read`}>
                <div>
                  <h3>
                    <span>{f.comic.title}</span>
                    {f.n}. {f.title}
                  </h3>
                  <p>
                    {f.comic.author} · {f.date} · только RU
                  </p>
                </div>
                <span className="e-chapter-pages">{f.pages} стр.</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="e-block" aria-labelledby="e-all-comics-h">
          <div className="e-block-head">
            <h2 id="e-all-comics-h">Все истории</h2>
            <span className="e-label">{comics.length} тайтлов</span>
          </div>
          <div className="e-cover-row" style={{ paddingTop: 20 }}>
            {comics.slice(1, 4).map((c) => (
              <Link key={c.slug} href={`/editorial/comics/${c.slug}`} className="e-cover-card">
                <Image src={c.cover} alt={`Обложка: ${c.title}`} width={300} height={400} sizes="(max-width: 600px) 45vw, 280px" />
                <h3>{c.title}</h3>
                <p>
                  {c.genres.join(' · ')} · {c.chapters} глав
                </p>
              </Link>
            ))}
          </div>
        </section>

        <p className="e-label" style={{ marginTop: 24, maxWidth: '62ch', lineHeight: 1.6 }}>
          Демонстрационные обложки и главы. Права на комиксы в production проверяются отдельно: русскоязычность —
          условие допуска, а не только локализация интерфейса.
        </p>
      </div>
    </div>
  );
}
