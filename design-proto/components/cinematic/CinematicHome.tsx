import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { anime, comics, getAnime } from '@/lib/mock';

export function CinematicHome() {
  const hero = getAnime('magicheskaya-bitva');
  const onAir = anime.filter((a) => a.status === 'Онгоинг').slice(0, 4);
  const continues = anime.filter((a) => a.progress).slice(0, 3);

  return (
    <div className="c-main">
      <section className="c-hero" aria-labelledby="c-hero-h">
        <Image className="c-hero-art" src={hero.backdrop} alt="" fill sizes="100vw" priority />
        <div className="c-hero-scrim" />
        <div className="c-wrap">
          <div className="c-hero-in">
            <span className="c-label">
              <Pulse live size={5} /> сейчас в тренде
            </span>
            <h1 className="c-hero-title" id="c-hero-h">
              {hero.title}
            </h1>
            <div className="c-hero-meta">
              <span>{hero.year}</span>
              <span>{hero.episodes} эпизодов</span>
              <span>{hero.studio}</span>
              <span className="c-chip c-chip--live">★ {hero.rating.toFixed(1)}</span>
              <span className="c-chip">16+</span>
              <span className="c-chip">{hero.status}</span>
            </div>
            <div className="c-hero-actions">
              <Link className="c-btn c-btn--primary" href={`/cinematic/anime/${hero.slug}/watch`}>
                <Icon name="play" size={15} filled /> Смотреть 9 серию
              </Link>
              <Link className="c-btn c-btn--ghost-light" href={`/cinematic/anime/${hero.slug}`}>
                Подробнее
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="c-wrap">
        <section className="c-section" aria-labelledby="c-onair">
          <div className="c-section-head">
            <h2 id="c-onair">Сейчас в эфире</h2>
            <Link href="/cinematic/catalog">
              Весь каталог <Icon name="arrow" size={12} />
            </Link>
          </div>
          <div className="c-rail">
            {onAir.map((a, i) => (
              <Link key={a.slug} href={`/cinematic/anime/${a.slug}`} className="c-still">
                <span className="c-still-art">
                  <Image src={a.backdrop} alt="" fill sizes="(max-width: 600px) 78vw, (max-width: 900px) 46vw, 24vw" />
                  <span className="c-still-rating">★ {a.rating.toFixed(1)}</span>
                  <span className="c-still-ep">{i === 0 ? 'серия 9 · сегодня' : `онгоинг · ${a.episodes} эп.`}</span>
                </span>
                <b>{a.title}</b>
                <span>
                  {a.original} · {a.studio}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="c-section" aria-labelledby="c-continue">
          <div className="c-section-head">
            <h2 id="c-continue">Продолжить просмотр</h2>
            <Link href="/cinematic/profile">
              История <Icon name="arrow" size={12} />
            </Link>
          </div>
          <div className="c-continues">
            {continues.map((a) => (
              <Link key={a.slug} className="c-continue" href={`/cinematic/anime/${a.slug}/watch`}>
                <span className="c-continue-art">
                  <Image src={a.backdrop} alt="" width={256} height={144} sizes="128px" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <h3>{a.title}</h3>
                  <p>
                    Серия {a.progress?.episode} · {a.progress?.percent}% · {a.kind}
                  </p>
                  <span className="c-progress">
                    <span style={{ width: `${a.progress?.percent ?? 0}%` }} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="c-section" aria-labelledby="c-new">
          <div className="c-section-head">
            <h2 id="c-new">Новинки каталога</h2>
            <Link href="/cinematic/catalog">
              Все 12 <Icon name="arrow" size={12} />
            </Link>
          </div>
          <div className="c-grid">
            {anime.slice(0, 6).map((a) => (
              <Link key={a.slug} href={`/cinematic/anime/${a.slug}`} className="c-poster-card">
                <span className="c-poster-art">
                  <Image
                    src={a.poster}
                    alt={`Обложка: ${a.title}`}
                    width={240}
                    height={360}
                    sizes="(max-width: 600px) 45vw, (max-width: 900px) 30vw, 15vw"
                  />
                </span>
                <b>{a.title}</b>
                <span>
                  {a.year} · {a.episodes > 0 ? `${a.episodes} эп.` : 'анонс'}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="c-section" aria-labelledby="c-comics">
          <div className="c-section-head">
            <h2 id="c-comics">Комиксы · RU</h2>
            <Link href="/cinematic/comics">
              Все истории <Icon name="arrow" size={12} />
            </Link>
          </div>
          <div className="c-rail c-cover-rail">
            {comics.slice(0, 5).map((c) => (
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
                  {c.genres[0]} · {c.chapters} глав
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
