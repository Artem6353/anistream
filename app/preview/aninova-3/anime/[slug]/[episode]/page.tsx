import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTitle, similarTitles, titleById, toCardTitle } from '@/lib/catalog';
import { episodeInfo } from '@/lib/episodes';
import { maxEpisodeNumberDb, validEpisodeDb } from '@/lib/episode-route';
import { watchOrder } from '@/lib/franchise';
import { isProxiable } from '@/lib/img';
import { STATUS_LABELS, TYPE_LABELS } from '@/lib/labels';
import {
  episodeAirDate,
  episodeName,
  episodeOfLabel,
  episodeWindow,
  formatWatchDate,
} from '@/lib/aninova3/watch-view';
import { A3Theatre } from '@/components/aninova3/A3Theatre';
import { A3Rail } from '@/components/aninova3/A3Rail';
import { A3Card } from '@/components/aninova3/A3Card';

const ROOT = '/preview/aninova-3';

interface Props {
  params: Promise<{ slug: string; episode: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, episode } = await params;
  const t = getTitle(slug);
  if (!t) return { title: 'Серия не найдена', robots: { index: false, follow: false } };
  return { title: `${t.ru} — серия ${episode}`, robots: { index: false, follow: false } };
}

export default async function A3WatchPage({ params }: Props) {
  const { slug, episode: raw } = await params;
  const title = getTitle(slug);
  if (!title || title.hidden) notFound();
  const episode = await validEpisodeDb(title, raw);
  if (episode === null) notFound();
  const total = await maxEpisodeNumberDb(title);
  const { totalUnknown } = episodeInfo(title);

  const name = episodeName(title, episode);
  const airDate = episodeAirDate(title, episode);
  const animeHref = `${ROOT}/anime/${title.slug}`;
  const near = episodeWindow(episode, total, 7);
  const franchise = watchOrder(title, titleById)
    .filter((t) => t.anilistId !== title.anilistId)
    .slice(0, 10);
  const similar = similarTitles(title, 10);
  const backdrop = isProxiable(title.banner ?? '') ? title.banner : isProxiable(title.poster) ? title.poster : null;

  const facts: [string, string][] = [
    ['Вышла', airDate ? formatWatchDate(airDate) : ''],
    ['Длительность', title.duration ? `${title.duration} мин` : ''],
    ['Всего серий', total > 1 ? `${total}${totalUnknown ? '+' : ''}` : ''],
    ['Статус', STATUS_LABELS[title.status]],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <article className="a3-watch">
      <div className="a3-wrap">
        <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
          <Link href={`${ROOT}/catalog`}>Каталог</Link>
          <span aria-hidden>/</span>
          <Link href={animeHref}>{title.ru}</Link>
          <span aria-hidden>/</span>
          <span aria-current="page">Серия {episode}</span>
        </nav>
      </div>

      <header className="a3-wrap a3-watchhead">
        <div className="a3-watchhead__row">
          <div className="a3-watchhead__copy">
            <p className="a3-kicker">
              Кинозал · {TYPE_LABELS[title.type]} · {title.year}
            </p>
            <h1 className="a3-watchhead__title">
              {title.ru}
              <span className="a3-watchhead__sep" aria-hidden>
                {' '}
                —{' '}
              </span>
              <span className="a3-watchhead__ep">серия {episode}</span>
            </h1>
            <p className="a3-watchhead__meta">
              {name ? <span className="a3-watchhead__epname">{name}</span> : null}
              {airDate ? (
                <span>
                  Вышла <time dateTime={new Date(airDate).toISOString()}>{formatWatchDate(airDate)}</time>
                </span>
              ) : null}
              {title.duration ? <span>{title.duration} мин</span> : null}
              <span>
                {total > 1
                  ? `${total}${totalUnknown ? '+' : ''} серий`
                  : title.type === 'movie'
                    ? 'полнометражный'
                    : '1 серия'}
              </span>
            </p>
          </div>

          <nav className="a3-watchhead__nav" aria-label="Навигация по сериям">
            {episode > 1 ? (
              <Link
                className="a3-btn a3-btn--ghost a3-watchhead__navbtn"
                href={`${ROOT}/anime/${title.slug}/${episode - 1}`}
                rel="prev"
              >
                <span aria-hidden>←</span> Серия {episode - 1}
              </Link>
            ) : null}
            <Link
              className="a3-btn a3-btn--ghost a3-watchhead__navbtn"
              href={animeHref}
              aria-describedby="a3-watch-return-desc"
            >
              К аниме
            </Link>
            <span id="a3-watch-return-desc" className="a3-visually-hidden">
              Вернуться на страницу аниме
            </span>
            {episode < total ? (
              <Link
                className="a3-btn a3-btn--primary a3-watchhead__navbtn"
                href={`${ROOT}/anime/${title.slug}/${episode + 1}`}
                rel="next"
              >
                Серия {episode + 1} <span aria-hidden>→</span>
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <A3Theatre
        title={title}
        episode={episode}
        totalEpisodes={total}
        totalUnknown={totalUnknown}
        backdrop={backdrop}
      />

      <div className="a3-wrap a3-watchbody">
        <aside className="a3-watchcard" aria-labelledby="a3-watch-episode">
          <p className="a3-kicker">{episodeOfLabel(episode, total, totalUnknown)}</p>
          <h2 className="a3-watchcard__title" id="a3-watch-episode">
            {name ?? `Серия ${episode}`}
          </h2>
          {facts.length ? (
            <dl className="a3-watchcard__facts">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <Link className="a3-btn a3-btn--ghost a3-watchcard__link" href={animeHref}>
            Страница аниме <span aria-hidden>→</span>
          </Link>
        </aside>

        <div className="a3-watchbody__main">
          <section className="a3-watch-eps" aria-labelledby="a3-watch-eps">
            <div className="a3-watch-eps__head">
              <h2 className="a3-h2" id="a3-watch-eps">
                Серии рядом
              </h2>
              <Link className="a3-link" href={`${animeHref}#a3-episodes`}>
                Все серии →
              </Link>
            </div>
            <ol className="a3-watch-eps__list">
              {near.map((n) => {
                const epName = episodeName(title, n);
                const label = epName ? `Серия ${n}: ${epName}` : `Серия ${n}`;
                return (
                  <li key={n}>
                    <Link
                      className={`a3-watch-eps__item${n === episode ? ' is-active' : ''}`}
                      href={`${ROOT}/anime/${title.slug}/${n}`}
                      aria-current={n === episode ? 'page' : undefined}
                      aria-label={label}
                      title={label}
                      data-a3-focusable
                    >
                      {n}
                    </Link>
                  </li>
                );
              })}
            </ol>
            <p className="a3-muted a3-watch-eps__hint">
              Полный список серий — на странице аниме. Плеер сохраняет позицию и помнит выбранную озвучку.
            </p>
          </section>

          <section className="a3-watchnote" aria-label="О плеере">
            <p>
              Плеер — тот же, что на текущем сайте: те же провайдеры, HLS и подписанные URL. Если источники
              не подключены в этой среде, он честно покажет пустое состояние, а не «нарисует» воспроизведение.
            </p>
            <p>
              Клавиатура и пульт: <kbd>←</kbd> <kbd>→</kbd> — ±10 секунд на сцене, <kbd>Space</kbd> — пауза,
              <kbd>Enter</kbd> — выбрать контрол, <kbd>Esc</kbd> — назад
              {episode < total ? (
                <>
                  , <kbd>N</kbd> — следующая серия
                </>
              ) : null}
              .
            </p>
          </section>
        </div>
      </div>

      {franchise.length ? (
        <A3Rail title="Франшиза" description="Связанные произведения и порядок просмотра">
          {franchise.map((t) => (
            <A3Card key={t.slug} title={toCardTitle(t)} />
          ))}
        </A3Rail>
      ) : null}

      {similar.length ? (
        <A3Rail title="Похожее" action={{ href: `${ROOT}/anime/${title.slug}`, label: 'К тайтлу' }}>
          {similar.map((t) => (
            <A3Card key={t.slug} title={toCardTitle(t)} />
          ))}
        </A3Rail>
      ) : null}
    </article>
  );
}
