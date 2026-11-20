import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { SaveButton } from '@/components/proto/SaveButton';
import { anime, episodesOf, type Anime } from '@/lib/mock';

export function MinimalAnimePage({ item }: { item: Anime }) {
  const episodes = episodesOf(item.slug);
  const similar = anime.filter((a) => a.slug !== item.slug && a.genres.some((g) => item.genres.includes(g))).slice(0, 3);

  return (
    <div className="m-wrap">
      <div className="m-anime">
        <nav className="m-crumbs" aria-label="Хлебные крошки">
          <Link href="/minimal">Главная</Link>
          <span aria-hidden="true">/</span>
          <Link href="/minimal/catalog">Каталог</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{item.title}</span>
        </nav>

        <div className="m-anime-hero">
          <Image
            className="m-poster-lg"
            src={item.poster}
            alt={`Обложка: ${item.title}`}
            width={168}
            height={252}
            sizes="(max-width: 768px) 128px, 168px"
            priority
          />
          <div>
            <h1 className="m-anime-title">{item.title}</h1>
            <p className="m-anime-original">
              {item.original} · {item.kind}
            </p>
            <div className="m-meta">
              <span>{item.year}</span>
              <span>{item.episodes > 0 ? `${item.episodes} эп.` : 'эпизоды не вышли'}</span>
              <span>{item.studio}</span>
              <span className="m-pill">{item.age}</span>
              {item.rating > 0 ? (
                <span className="m-rating">
                  <Icon name="star" size={11} filled /> {item.rating.toFixed(1)}
                </span>
              ) : null}
              {item.status === 'Онгоинг' ? (
                <span className="m-pill m-pill--ok">
                  <Pulse live size={5} /> Онгоинг
                </span>
              ) : (
                <span className="m-pill">{item.status}</span>
              )}
            </div>
            <div className="m-anime-actions">
              <Link className="m-btn m-btn--primary" href={`/minimal/anime/${item.slug}/watch`}>
                <Icon name="play" size={14} /> Смотреть {item.progress ? `с ${item.progress.episode} серии` : '1 серию'}
              </Link>
              <SaveButton className="m-btn" />
            </div>
          </div>
        </div>

        <div className="m-anime-body">
          <div>
            <h2 className="m-block-title">Описание</h2>
            <p className="m-synopsis">{item.synopsis}</p>

            <dl className="m-spec">
              <div className="m-spec-cell">
                <dt>Год</dt>
                <dd>{item.year}</dd>
              </div>
              <div className="m-spec-cell">
                <dt>Студия</dt>
                <dd>{item.studio}</dd>
              </div>
              <div className="m-spec-cell">
                <dt>Эпизоды</dt>
                <dd>{item.episodes > 0 ? item.episodes : '—'}</dd>
              </div>
              <div className="m-spec-cell">
                <dt>Статус</dt>
                <dd>{item.status}</dd>
              </div>
              <div className="m-spec-cell">
                <dt>Жанры</dt>
                <dd>{item.genres.join(', ')}</dd>
              </div>
              <div className="m-spec-cell">
                <dt>Озвучка</dt>
                <dd>{item.voice}</dd>
              </div>
            </dl>

            <div style={{ marginTop: 32 }}>
              <h2 className="m-block-title">Эпизоды · {episodes.length}</h2>
              <div className="m-episodes">
                {episodes.map((ep) => (
                  <Link
                    key={ep.n}
                    className={`m-ep${item.progress?.episode === ep.n ? ' is-current' : ''}`}
                    href={`/minimal/anime/${item.slug}/watch`}
                  >
                    <span className="m-ep-num">{String(ep.n).padStart(2, '0')}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="m-ep-title">{ep.title}</span>
                      <span className="m-ep-sub">
                        <span>{ep.duration}</span>
                        <span>{ep.date}</span>
                        <span>{ep.quality}</span>
                      </span>
                    </span>
                    <span className="m-ep-status">
                      {ep.watched ? (
                        <>
                          <Icon name="check" size={13} /> просмотрено
                        </>
                      ) : ep.progress ? (
                        `${ep.progress}%`
                      ) : (
                        <Icon name="play" size={13} />
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <aside className="m-side-card" aria-labelledby="m-similar">
            <h2 className="m-block-title" id="m-similar" style={{ marginBottom: 8 }}>
              Похожее
            </h2>
            <div className="m-rows" style={{ borderTop: 0 }}>
              {similar.map((s) => (
                <Link key={s.slug} className="m-row" href={`/minimal/anime/${s.slug}`} style={{ gridTemplateColumns: '38px minmax(0,1fr)' }}>
                  <Image className="m-row-thumb" src={s.poster} alt="" width={38} height={57} sizes="38px" />
                  <span style={{ minWidth: 0 }}>
                    <span className="m-row-title" style={{ fontSize: 13 }}>
                      {s.title}
                    </span>
                    <span className="m-row-meta">{s.year} · {s.genres[0]}</span>
                  </span>
                </Link>
              ))}
            </div>
            <p className="m-demo-note">Подборка локальная: совпадение по первому жанру, без ML-рекомендаций.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
