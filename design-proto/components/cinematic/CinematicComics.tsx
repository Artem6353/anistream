import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { comics, getComic } from '@/lib/mock';

export function CinematicComics() {
  const feature = getComic('steklyannyj-gorod');
  const fresh = [
    { comic: comics[2], n: 24, title: 'Слой третий', date: 'сегодня' },
    { comic: comics[0], n: 42, title: 'Свет выключили', date: 'вчера' },
    { comic: comics[3], n: 9, title: 'Плёнка горит', date: '4 дня' },
    { comic: comics[1], n: 18, title: 'Один градус', date: '6 дней' },
  ];

  return (
    <div className="c-main">
      <section className="c-comics-hero" aria-labelledby="c-comics-h">
        <div className="c-comics-ambient" aria-hidden="true">
          <Image src={comics[1].cover} alt="" width={800} height={1200} sizes="46vw" />
        </div>
        <div className="c-wrap c-comics-hero-grid">
          <Link href={`/cinematic/comics/${feature.slug}`} aria-label={feature.title}>
            <Image
              className="c-comics-cover"
              src={feature.cover}
              alt={`Обложка: ${feature.title}`}
              width={600}
              height={900}
              sizes="(max-width: 900px) 80vw, 300px"
              priority
            />
          </Link>
          <div className="c-comics-copy">
            <span className="c-label">
              <Pulse size={5} /> комиксы · только на русском
            </span>
            <h1 className="c-display" id="c-comics-h" style={{ fontSize: 'clamp(30px, 5vw, 64px)' }}>
              Комиксы
            </h1>
            <p>
              Шесть историй, которые не нужно ждать в переводе. Крупные обложки, тихий интерфейс и читалка, которая не
              мешает странице.
            </p>
            <div className="c-hero-actions">
              <Link className="c-btn c-btn--primary" href={`/cinematic/comics/${feature.slug}/read`}>
                <Icon name="book" size={15} /> Читать сейчас
              </Link>
              <Link className="c-btn" href={`/cinematic/comics/${feature.slug}`}>
                Об издании
              </Link>
            </div>
            <p className="c-label">
              Продолжить: {feature.title} · глава {feature.progress?.chapter} · стр. {feature.progress?.page} из{' '}
              {feature.progress?.pages}
            </p>
          </div>
        </div>
      </section>

      <div className="c-wrap">
        <section className="c-section" aria-labelledby="c-fresh">
          <div className="c-section-head">
            <h2 id="c-fresh">Новые главы</h2>
            <span className="c-label">обновлено сегодня</span>
          </div>
          <div className="c-new-rows">
            {fresh.map((f) => (
              <Link key={`${f.comic.slug}-${f.n}`} className="c-new-row" href={`/cinematic/comics/${f.comic.slug}/read`}>
                <div>
                  <b>
                    {f.comic.title} · {f.n}. {f.title}
                  </b>
                  <p>
                    {f.comic.author} · {f.comic.genres.join(' · ')}
                  </p>
                </div>
                <time>{f.date}</time>
              </Link>
            ))}
          </div>
        </section>

        <section className="c-section" aria-labelledby="c-all-comics">
          <div className="c-section-head">
            <h2 id="c-all-comics">Все истории</h2>
            <span className="c-label">{comics.length} тайтлов</span>
          </div>
          <div className="c-rail c-cover-rail">
            {comics.map((c) => (
              <Link key={c.slug} href={`/cinematic/comics/${c.slug}`}>
                <span className="c-cover-art">
                  <Image
                    src={c.cover}
                    alt={`Обложка: ${c.title}`}
                    width={300}
                    height={450}
                    sizes="(max-width: 600px) 42vw, (max-width: 900px) 24vw, 13vw"
                  />
                </span>
                <b>{c.title}</b>
                <span>
                  {c.status} · {c.chapters} глав
                </span>
              </Link>
            ))}
          </div>
        </section>

        <p className="c-label" style={{ marginTop: 10, lineHeight: 1.7 }}>
          Демонстрационные обложки и главы. В production русскоязычность — условие допуска контента, а не только
          локализация интерфейса.
        </p>
      </div>
    </div>
  );
}
