import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTitle, similarTitles, titleById, toCardTitle } from '@/lib/catalog';
import { watchOrder } from '@/lib/franchise';
import { episodeInfo } from '@/lib/episodes';
import { genreLabel, SEASON_LABELS, SOURCE_LABELS, STATUS_LABELS, TYPE_LABELS } from '@/lib/labels';
import { isProxiable } from '@/lib/img';
import { A3BannerImg } from '@/components/aninova3/A3BannerImg';
import { PosterArt } from '@/components/anime/PosterArt';
import { A3Bookmark } from '@/components/aninova3/A3Bookmark';
import { A3Resume } from '@/components/aninova3/A3Resume';
import { A3Rail } from '@/components/aninova3/A3Rail';
import { A3Card } from '@/components/aninova3/A3Card';
import { A3SourceSection } from '@/components/aninova3/comics/A3SourceSection';
import { resolveAnimeSources } from '@/lib/aninova3/comics/source-links';
import { IconPlay, IconStar } from '@/components/ui/icons';

const ROOT = '/preview/aninova-3';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = getTitle(slug);
  return { title: t ? t.ru : 'Тайтл не найден', robots: { index: false, follow: false } };
}

export default async function A3AnimePage({ params }: Props) {
  const { slug } = await params;
  const title = getTitle(slug);
  if (!title || title.hidden) notFound();

  const info = episodeInfo(title);
  const released = info.released ?? 0;
  const shown = Math.min(12, released);
  const more = Math.min(30, released) - shown;
  const similar = similarTitles(title, 10);
  /* Франшиза и порядок просмотра — существующая логика lib/franchise (BFS по связям). */
  const franchise = watchOrder(title, titleById).filter((t) => t.anilistId !== title.anilistId).slice(0, 10);
  const sourceLinks = resolveAnimeSources(title.anilistId, {
    animeYear: title.year,
    /* Первоисточник аниме из каталога: без него направление связи остаётся догадкой по датам. */
    animeSource: title.source,
  });
  const wide = isProxiable(title.banner) ? title.banner : null;
  const firstEpisode = released > 0 ? `${ROOT}/anime/${title.slug}/1` : `${ROOT}/anime/${title.slug}`;
  const facts: [string, string | null][] = [
    ['Тип', TYPE_LABELS[title.type]],
    ['Статус', STATUS_LABELS[title.status]],
    ['Год', `${title.year}${title.season ? `, ${SEASON_LABELS[title.season]}` : ''}`],
    ['Серии', info.total ? `${info.total}${info.totalUnknown ? '+' : ''}` : released ? `${released}${info.totalUnknown ? '+' : ''}` : null],
    ['Студия', title.studios?.slice(0, 2).join(', ') ?? null],
    ['Длительность', title.duration ? `${title.duration} мин` : null],
    ['Первоисточник', title.source ? SOURCE_LABELS[title.source] ?? title.source : null],
    ['Рейтинг', title.score > 0 ? `${title.score.toFixed(1)} / 10` : null],
  ];

  return (
    <article className="a3-anime">
      <div className="a3-wrap">
        <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
          <Link href={`${ROOT}/catalog`}>Каталог</Link>
          <span aria-hidden>/</span>
          <span aria-current="page">{title.ru}</span>
        </nav>
      </div>
      <header className={`a3-anime__hero${wide ? '' : ' a3-anime__hero--plain'}`}>
        {wide ? (
          <A3BannerImg className="a3-anime__bg" src={wide} quality={50} priority />
        ) : null}
        <div className="a3-anime__scrim" aria-hidden />
        <div className="a3-wrap a3-anime__heroin">
          <div className="a3-anime__poster">
            <PosterArt src={title.poster} seed={title.slug} initials={title.ru || '?'} alt={`Постер: ${title.ru}`} width={260} eager />
          </div>
          <div className="a3-anime__head">
            <p className="a3-kicker">
              {TYPE_LABELS[title.type]} · {title.year}
            </p>
            <h1 className="a3-h1 a3-anime__title">{title.ru}</h1>
            <p className="a3-anime__meta">
              {title.score > 0 ? (
                <span className="a3-score">
                  <IconStar size={13} /> {title.score.toFixed(1)}
                </span>
              ) : null}
              <span>{STATUS_LABELS[title.status]}</span>
              {released ? <span>{released}{info.totalUnknown ? '+' : ''} серий</span> : null}
              {title.duration ? <span>{title.duration} мин</span> : null}
            </p>
            <div className="a3-chips a3-chips--inline">
              {title.genres.slice(0, 5).map((g) => (
                <Link key={g} className="a3-chip a3-chip--sm" href={`${ROOT}/catalog?genre=${g}`}>
                  {genreLabel(g)}
                </Link>
              ))}
            </div>
            <div className="a3-anime__actions">
              <Link className="a3-btn a3-btn--primary a3-btn--lg" href={firstEpisode}>
                <IconPlay size={18} /> {released ? 'Смотреть' : 'Скоро'}
              </Link>
              <A3Bookmark slug={title.slug} />
              <A3Resume slug={title.slug} />
            </div>
          </div>
        </div>
      </header>

      <div className="a3-wrap a3-anime__body">
        <div className="a3-anime__main">
          <section aria-labelledby="a3-about">
            <h2 className="a3-h2" id="a3-about">
              Описание
            </h2>
            <p className="a3-prose">{title.description || 'Описание пока не заполнено.'}</p>
          </section>

          {released > 0 ? (
            <section aria-labelledby="a3-episodes">
              <div className="a3-section__head a3-section__head--inline">
                <h2 className="a3-h2" id="a3-episodes">
                  Серии
                </h2>
                <p className="a3-muted">
                  {released} {released === 1 ? 'серия' : 'серий'} · смотреть можно с любой
                </p>
              </div>
              <ol className="a3-eplist">
                {Array.from({ length: shown }, (_, i) => i + 1).map((n) => (
                  <li key={n}>
                    <Link className="a3-ep" href={`${ROOT}/anime/${title.slug}/${n}`} data-a3-focusable>
                      <span className="a3-ep__num">{String(n).padStart(2, '0')}</span>
                      <span className="a3-ep__title">{title.episodeNames?.[String(n)] ?? `Серия ${n}`}</span>
                      <span className="a3-ep__play" aria-hidden>
                        <IconPlay size={14} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
              {more > 0 ? (
                <details className="a3-more">
                  <summary className="a3-more__summary">Показать ещё {more} серий</summary>
                  <ol className="a3-eplist" start={shown + 1}>
                    {Array.from({ length: more }, (_, i) => shown + i + 1).map((n) => (
                      <li key={n}>
                        <Link className="a3-ep" href={`${ROOT}/anime/${title.slug}/${n}`} data-a3-focusable>
                          <span className="a3-ep__num">{String(n).padStart(2, '0')}</span>
                          <span className="a3-ep__title">{title.episodeNames?.[String(n)] ?? `Серия ${n}`}</span>
                          <span className="a3-ep__play" aria-hidden>
                            <IconPlay size={14} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </section>
          ) : (
            <p className="a3-muted">Серии ещё не вышли.</p>
          )}

          <section className="a3-anime__sources" aria-labelledby="a3-sources">
            <h2 className="a3-h2" id="a3-sources">
              Источники и просмотр
            </h2>
            {/* Список источников здесь не рисуем: доступность конкретного потока
                решает существующий плеер на странице серии. Обещать «источник есть»
                по одному названию тайтла нельзя. */}
            <p className="a3-muted">
              Доступные источники и переводы проверяются на странице серии: там открывается существующий плеер, он же сообщает,
              если потока нет. В карточке источника мы ничего не придумываем.
            </p>
            <div className="a3-chips a3-chips--inline">
              <Link className="a3-btn a3-btn--ghost" href={firstEpisode} data-a3-focusable>
                {released ? 'Открыть первую серию' : 'Страница произведения'}
              </Link>
              <Link className="a3-btn a3-btn--ghost" href={`${ROOT}/schedule`} data-a3-focusable>
                Расписание эфиров
              </Link>
            </div>
          </section>
        </div>

        <aside className="a3-anime__side" aria-labelledby="a3-facts">
          <h2 className="a3-h2" id="a3-facts">
            Досье
          </h2>
          <dl className="a3-facts">
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="a3-facts__row">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          {title.characters?.length ? (
            <div className="a3-cast">
              <h3 className="a3-h3">Персонажи</h3>
              <ul>
                {title.characters.slice(0, 4).map((c) => (
                  <li key={c.name}>
                    {c.name} <span className="a3-muted">{c.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      <div className="a3-wrap">
        <A3SourceSection links={sourceLinks} />
      </div>

      {franchise.length ? (
        <A3Rail title="Франшиза" action={{ href: `${ROOT}/catalog?sort=pop`, label: 'В каталог' }} description="Порядок просмотра по связям каталога">
          {franchise.map((t) => (
            <A3Card key={t.slug} title={toCardTitle(t)} />
          ))}
        </A3Rail>
      ) : null}

      {similar.length ? (
        <A3Rail title="Похожее" action={{ href: `${ROOT}/catalog?genre=${similar[0].genres[0] ?? ''}`, label: 'В каталог' }}>
          {similar.map((t) => (
            <A3Card key={t.slug} title={toCardTitle(t)} />
          ))}
        </A3Rail>
      ) : null}
    </article>
  );
}
