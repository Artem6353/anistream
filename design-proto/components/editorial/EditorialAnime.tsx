import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { SaveButton } from '@/components/proto/SaveButton';
import { episodesOf, type Anime } from '@/lib/mock';

export function EditorialAnime({ item }: { item: Anime }) {
  const episodes = episodesOf(item.slug);

  return (
    <div className="e-wrap">
      <article className="e-article">
        <nav className="e-crumbs" aria-label="Хлебные крошки">
          <Link href="/editorial">Главная</Link>
          <span aria-hidden="true">/</span>
          <Link href="/editorial/catalog">Каталог</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{item.title}</span>
        </nav>

        <div className="e-article-grid">
          <header className="e-article-head">
            <span className="e-label">
              Разбор · {item.kind} · {item.year}
            </span>
            <h1>{item.title}</h1>
            <p className="e-standfirst">
              {item.original} · {item.studio}. Материал собран из демонстрационного описания: проверяется вёрстка
              длинного текста, а не редакционный факт-чекинг.
            </p>
            <p className="e-byline">
              <b>Редакция AniNova</b>
              <span>12 минут чтения</span>
              <span>{item.genres.join(' · ')}</span>
              <span>{item.episodes > 0 ? `${item.episodes} эпизодов` : 'анонс'}</span>
            </p>
          </header>

          <div>
            <figure className="e-article-figure">
              <Image
                src={item.poster}
                alt={`Обложка: ${item.title}`}
                width={560}
                height={746}
                sizes="(max-width: 768px) 100vw, 420px"
                priority
              />
              <figcaption>Демонстрационная обложка · не постер тайтла · {item.studio}</figcaption>
            </figure>

            <div className="e-prose" style={{ marginTop: 20 }}>
              <p>{item.synopsis}</p>
              <p>
                Ниже — «содержание выпуска»: список эпизодов и досье. Это тот случай, когда интерфейс не мешает тексту:
                линейки, отступы и один акцентный цвет делают всю навигационную работу.
              </p>
            </div>

            <blockquote className="e-pullquote">
              «Медленная история о времени, в которой каждое «потом» оказывается слишком поздно».
              <cite>Демо-цитата из описания, не редакционный текст</cite>
            </blockquote>

            <div className="e-lead-actions" style={{ marginBottom: 24 }}>
              <Link className="e-btn e-btn--seal" href={`/editorial/anime/${item.slug}/watch`}>
                <Icon name="play" size={14} filled /> Смотреть {item.progress ? `с ${item.progress.episode} серии` : 'первую серию'}
              </Link>
              <SaveButton className="e-save" />
            </div>

            <section aria-labelledby="e-toc-h">
              <div className="e-block-head">
                <h2 id="e-toc-h" style={{ fontSize: 20 }}>
                  Содержание
                </h2>
                <span className="e-label">{episodes.length} эпизодов</span>
              </div>
              <div className="e-toc">
                {episodes.map((ep) => (
                  <Link
                    key={ep.n}
                    href={`/editorial/anime/${item.slug}/watch`}
                    className="e-toc-row"
                    aria-current={item.progress?.episode === ep.n ? 'true' : undefined}
                  >
                    <span className="e-toc-n">{String(ep.n).padStart(2, '0')}</span>
                    <h3>
                      {ep.title}
                      <em>{ep.date}</em>
                    </h3>
                    <span className="e-toc-right">
                      {ep.duration} · {ep.progress ? `${ep.progress}%` : ep.quality}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <aside className="e-facts" aria-labelledby="e-facts-h">
            <h2 id="e-facts-h">Досье</h2>
            <dl style={{ margin: 0 }}>
              <div className="e-fact">
                <dt>Оригинал</dt>
                <dd>{item.original}</dd>
              </div>
              <div className="e-fact">
                <dt>Студия</dt>
                <dd>{item.studio}</dd>
              </div>
              <div className="e-fact">
                <dt>Год</dt>
                <dd>{item.year}</dd>
              </div>
              <div className="e-fact">
                <dt>Эпизоды</dt>
                <dd>{item.episodes > 0 ? item.episodes : '—'}</dd>
              </div>
              <div className="e-fact">
                <dt>Статус</dt>
                <dd>{item.status}</dd>
              </div>
              <div className="e-fact">
                <dt>Возраст</dt>
                <dd>{item.age}</dd>
              </div>
              <div className="e-fact">
                <dt>Озвучка</dt>
                <dd>{item.voice}</dd>
              </div>
              <div className="e-fact">
                <dt>Оценка</dt>
                <dd>{item.rating > 0 ? `${item.rating.toFixed(1)} / 10` : '—'}</dd>
              </div>
            </dl>
            <h2>Права</h2>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
              Демонстрационные метаданные. В production метаданные, обложки и embed лицензируются отдельно; неизвестное
              право = запрет показа.
            </p>
            <h2>Читайте также</h2>
            <div style={{ display: 'grid', gap: 2 }}>
              <Link className="e-textlink" href="/editorial/comics/steklyannyj-gorod" style={{ fontSize: 11 }}>
                «Стеклянный город» — комикс
              </Link>
              <Link className="e-textlink" href="/editorial/catalog" style={{ fontSize: 11 }}>
                Индекс каталога
              </Link>
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}
