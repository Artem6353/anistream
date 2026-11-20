import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { anime, catalogFilters, comics, featured } from '@/lib/mock';

export function MinimalHome() {
  const onAir = anime.filter((a) => a.status === 'Онгоинг').slice(0, 4);
  const continueList = anime.filter((a) => a.progress).slice(0, 3);

  return (
    <div className="m-wrap">
      <section className="m-hero">
        <div>
          <span className="m-kicker">
            <Pulse live size={5} /> демо-каталог · 12 тайтлов
          </span>
          <h1 className="m-h1">Каталог без лишнего шума.</h1>
          <p className="m-lead">
            Один экран — одна задача. Найти, открыть, продолжить. Никаких баннеров на пол-экрана и каруселей, которые
            нельзя остановить.
          </p>
          <div className="m-actions">
            <Link className="m-btn m-btn--primary" href="/minimal/catalog">
              Открыть каталог <Icon name="arrow" size={15} />
            </Link>
            <Link className="m-btn" href="/minimal/anime/magicheskaya-bitva/watch">
              <Icon name="play" size={14} /> Продолжить 9 серию
            </Link>
          </div>
        </div>

        <article className="m-feature">
          <Image
            className="m-feature-poster"
            src={featured.poster}
            alt={`Обложка: ${featured.title}`}
            width={96}
            height={144}
            sizes="96px"
            priority
          />
          <div>
            <span className="m-feature-label">Сейчас смотрят</span>
            <h2 className="m-feature-title">{featured.title}</h2>
            <div className="m-feature-meta">
              <span>{featured.year}</span>
              <span>{featured.episodes} эп.</span>
              <span className="m-rating">
                <Icon name="star" size={11} filled /> {featured.rating.toFixed(1)}
              </span>
            </div>
            <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              Продолжить с 9 серии · осталось 38
            </p>
            <Link className="m-btn m-btn--sm" href="/minimal/anime/magicheskaya-bitva/watch">
              Смотреть
            </Link>
          </div>
        </article>
      </section>

      <section className="m-section" aria-labelledby="m-onair">
        <div className="m-section-head">
          <h2 className="m-h2" id="m-onair">
            Сейчас в эфире
          </h2>
          <Link className="m-more" href="/minimal/catalog">
            Весь каталог <Icon name="arrow" size={13} />
          </Link>
        </div>
        <div className="m-rows">
          {onAir.map((a) => (
            <Link key={a.slug} className="m-row" href={`/minimal/anime/${a.slug}`}>
              <Image className="m-row-thumb" src={a.poster} alt="" width={44} height={66} sizes="44px" />
              <span style={{ minWidth: 0 }}>
                <span className="m-row-title">{a.title}</span>
                <span className="m-row-meta">
                  <span>{a.original}</span>
                  <span>{a.studio}</span>
                  <span>{a.episodes} эп.</span>
                </span>
              </span>
              <span className="m-row-side">
                <span className="m-ongoing">
                  <Pulse live size={5} /> Онгоинг
                </span>
                <span className="m-rating">
                  <Icon name="star" size={11} filled /> {a.rating.toFixed(1)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="m-section" aria-labelledby="m-continue">
        <div className="m-section-head">
          <h2 className="m-h2" id="m-continue">
            Продолжить просмотр
          </h2>
          <Link className="m-more" href="/minimal/profile">
            История <Icon name="arrow" size={13} />
          </Link>
        </div>
        <div className="m-continues">
          {continueList.map((a) => (
            <Link key={a.slug} className="m-continue" href={`/minimal/anime/${a.slug}/watch`}>
              <span className="m-continue-art">
                <Image src={a.backdrop} alt="" width={216} height={122} sizes="(max-width: 768px) 108px, 216px" />
                <span className="m-progress">
                  <span style={{ width: `${a.progress?.percent ?? 0}%` }} />
                </span>
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="m-continue-title">{a.title}</span>
                <span className="m-continue-meta" style={{ display: 'block' }}>
                  Серия {a.progress?.episode} · {a.progress?.percent}% · {a.kind}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="m-section" aria-labelledby="m-catalog">
        <div className="m-section-head">
          <h2 className="m-h2" id="m-catalog">
            Каталог
          </h2>
          <Link className="m-more" href="/minimal/catalog">
            Все 12 <Icon name="arrow" size={13} />
          </Link>
        </div>
        <div className="m-chips" style={{ marginBottom: 20 }}>
          {catalogFilters.genres.slice(0, 6).map((g, i) => (
            <Link key={g} className={`m-chip${i === 0 ? ' is-on' : ''}`} href="/minimal/catalog">
              {g}
            </Link>
          ))}
        </div>
        <div className="m-grid">
          {anime.slice(0, 6).map((a) => (
            <Link key={a.slug} className="m-card" href={`/minimal/anime/${a.slug}`}>
              <Image className="m-card-poster" src={a.poster} alt={`Обложка: ${a.title}`} width={200} height={300} sizes="(max-width: 768px) 45vw, (max-width: 1200px) 30vw, 190px" />
              <span className="m-card-title">{a.title}</span>
              <span className="m-card-meta">
                {a.year} · {a.episodes > 0 ? `${a.episodes} эп.` : 'анонс'}
                {a.rating > 0 ? (
                  <span className="m-rating" style={{ marginLeft: 'auto' }}>
                    <Icon name="star" size={10} filled /> {a.rating.toFixed(1)}
                  </span>
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="m-section" aria-labelledby="m-comics">
        <div className="m-section-head">
          <h2 className="m-h2" id="m-comics">
            Комиксы · только RU
          </h2>
          <Link className="m-more" href="/minimal/comics">
            Все комиксы <Icon name="arrow" size={13} />
          </Link>
        </div>
        <div className="m-comic-grid">
          {comics.slice(0, 4).map((c) => (
            <Link key={c.slug} className="m-comic-card" href={`/minimal/comics/${c.slug}`}>
              <Image className="m-comic-cover" src={c.cover} alt={`Обложка: ${c.title}`} width={200} height={300} sizes="(max-width: 768px) 45vw, 22vw" />
              <span className="m-comic-card-title">{c.title}</span>
              <span className="m-comic-card-meta">
                {c.chapters} глав · {c.status}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
