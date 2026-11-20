import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { SaveButton } from '@/components/proto/SaveButton';
import { anime, episodesOf, type Anime } from '@/lib/mock';

export function CinematicAnime({ item }: { item: Anime }) {
  const episodes = episodesOf(item.slug);
  const similar = anime.filter((a) => a.slug !== item.slug && a.genres.some((g) => item.genres.includes(g))).slice(0, 3);

  return (
    <div className="c-main">
      <section className="c-anime-hero" aria-labelledby="c-anime-h">
        <Image className="c-hero-art" src={item.backdrop} alt="" fill sizes="100vw" priority />
        <div className="c-hero-scrim" />
        <div className="c-wrap">
          <div className="c-anime-hero-in">
            <Image
              className="c-anime-poster"
              src={item.poster}
              alt={`Обложка: ${item.title}`}
              width={150}
              height={225}
              sizes="150px"
            />
            <div className="c-anime-hero-text">
              <span className="c-label">
                <Pulse size={5} /> {item.kind} · {item.year} · {item.studio}
              </span>
              <h1 className="c-hero-title" id="c-anime-h" style={{ fontSize: 'clamp(28px, 5vw, 64px)' }}>
                {item.title}
              </h1>
              <div className="c-hero-meta">
                <span>{item.original}</span>
                {item.rating > 0 ? <span className="c-chip c-chip--live">★ {item.rating.toFixed(1)}</span> : null}
                <span className="c-chip">{item.age}</span>
                <span className="c-chip">{item.status}</span>
                <span className="c-chip">{item.episodes > 0 ? `${item.episodes} эп.` : 'анонс'}</span>
              </div>
              <div className="c-hero-actions">
                <Link className="c-btn c-btn--primary" href={`/cinematic/anime/${item.slug}/watch`}>
                  <Icon name="play" size={15} filled /> Смотреть {item.progress ? `с ${item.progress.episode} серии` : '1 серию'}
                </Link>
                <SaveButton className="c-btn c-btn--ghost-light" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="c-wrap">
        <dl className="c-strip">
          <div className="c-strip-cell">
            <dt>Оценка</dt>
            <dd>{item.rating > 0 ? item.rating.toFixed(1) : '—'}</dd>
          </div>
          <div className="c-strip-cell">
            <dt>Эпизоды</dt>
            <dd>{item.episodes > 0 ? item.episodes : '—'}</dd>
          </div>
          <div className="c-strip-cell">
            <dt>Статус</dt>
            <dd>{item.status}</dd>
          </div>
          <div className="c-strip-cell">
            <dt>Возраст</dt>
            <dd>{item.age}</dd>
          </div>
        </dl>

        <div className="c-anime-body">
          <div>
            <h2 className="c-label" style={{ marginBottom: 8 }}>
              Описание
            </h2>
            <p className="c-synopsis">{item.synopsis}</p>
            <p className="c-label" style={{ marginTop: 10 }}>
              {item.genres.join(' · ')} · озвучка {item.voice}
            </p>

            <div className="c-section-head" style={{ marginTop: 24 }}>
              <h2>Эпизоды</h2>
              <span className="c-label" style={{ fontSize: 10 }}>
                сезон 1
              </span>
            </div>
            <div className="c-ep-grid">
              {episodes.map((ep) => (
                <Link
                  key={ep.n}
                  className="c-ep-tile"
                  href={`/cinematic/anime/${item.slug}/watch`}
                  aria-current={item.progress?.episode === ep.n ? 'true' : undefined}
                >
                  <b>{String(ep.n).padStart(2, '0')}</b>
                  <span>{ep.title}</span>
                  <em>
                    {ep.duration} · {ep.progress ? `${ep.progress}%` : ep.quality}
                  </em>
                </Link>
              ))}
            </div>
          </div>

          <aside>
            <h2 className="c-label" style={{ marginBottom: 10 }}>
              Похожее
            </h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {similar.map((s) => (
                <Link key={s.slug} href={`/cinematic/anime/${s.slug}`} className="c-continue">
                  <span className="c-continue-art">
                    <Image src={s.backdrop} alt="" width={256} height={144} sizes="128px" />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <h3>{s.title}</h3>
                    <p>
                      {s.year} · {s.genres[0]} · ★ {s.rating.toFixed(1)}
                    </p>
                  </span>
                </Link>
              ))}
            </div>
            <p className="c-label" style={{ marginTop: 14, lineHeight: 1.6 }}>
              Подборка по первому жанру, без ML. Демо-данные.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
