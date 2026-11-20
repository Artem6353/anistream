import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { SaveButton } from '@/components/proto/SaveButton';
import { chaptersOf, type Comic } from '@/lib/mock';

export function EditorialComic({ item }: { item: Comic }) {
  const chapters = chaptersOf(item.slug);

  return (
    <div className="e-wrap">
      <article className="e-comic-article">
        <nav className="e-crumbs" aria-label="Хлебные крошки">
          <Link href="/editorial">Главная</Link>
          <span aria-hidden="true">/</span>
          <Link href="/editorial/comics">Комиксы</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{item.title}</span>
        </nav>

        <div className="e-article-grid">
          <header className="e-article-head">
            <span className="e-label">Графический роман · только RU · {item.year}</span>
            <h1>{item.title}</h1>
            <p className="e-standfirst">
              {item.author} · художник {item.artist} · {item.status.toLowerCase()} · {item.chapters} глав
            </p>
            <p className="e-byline">
              <b>{item.rated}</b>
              <span>{item.genres.join(' · ')}</span>
              <span>обновлено {item.updated}</span>
            </p>
          </header>

          <div>
            <figure className="e-article-figure">
              <Image
                src={item.cover}
                alt={`Обложка: ${item.title}`}
                width={560}
                height={746}
                sizes="(max-width: 768px) 100vw, 420px"
                priority
              />
              <figcaption>Обложка демонстрационная · не реальное издание</figcaption>
            </figure>

            <div className="e-prose" style={{ marginTop: 20 }}>
              <p>{item.synopsis}</p>
              <p>
                Первый абзац набран с буквицей — так текст получает вход, а не просто начинается. Дальше — обычная
                колонка 66 символов, которая не растягивается на широком мониторе.
              </p>
            </div>

            <div className="e-pullquote">
              «Прозрачность — это не отсутствие стен, а отсутствие выбора, где стоять».
              <cite>Демонстрационная цитата</cite>
            </div>

            <div className="e-lead-actions" style={{ marginBottom: 24 }}>
              <Link className="e-btn e-btn--seal" href={`/editorial/comics/${item.slug}/read`}>
                <Icon name="book" size={15} /> Читать главу {item.progress?.chapter ?? 1}
              </Link>
              <SaveButton className="e-save" label="В библиотеку" />
            </div>

            <section aria-labelledby="e-comic-toc">
              <div className="e-block-head">
                <h2 id="e-comic-toc" style={{ fontSize: 20 }}>
                  Содержание
                </h2>
                <span className="e-label">сначала новые</span>
              </div>
              <div className="e-chapter-list">
                {chapters.map((c) => (
                  <Link key={c.n} className="e-chapter-row" href={`/editorial/comics/${item.slug}/read`}>
                    <div>
                      <h3>
                        <span>{String(c.n).padStart(2, '0')}</span>
                        {c.title}
                        {c.new ? <span className="e-new-stamp">new</span> : null}
                      </h3>
                      <p>{c.date}</p>
                    </div>
                    <span className="e-chapter-pages">{c.pages} стр.</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <aside className="e-facts" aria-labelledby="e-comic-facts">
            <h2 id="e-comic-facts">Выходные данные</h2>
            <dl style={{ margin: 0 }}>
              <div className="e-fact">
                <dt>Автор</dt>
                <dd>{item.author}</dd>
              </div>
              <div className="e-fact">
                <dt>Художник</dt>
                <dd>{item.artist}</dd>
              </div>
              <div className="e-fact">
                <dt>Жанр</dt>
                <dd>{item.genres.join(', ')}</dd>
              </div>
              <div className="e-fact">
                <dt>Язык</dt>
                <dd>Русский</dd>
              </div>
              <div className="e-fact">
                <dt>Глав</dt>
                <dd>{item.chapters}</dd>
              </div>
              <div className="e-fact">
                <dt>Права</dt>
                <dd>Демо</dd>
              </div>
            </dl>
            <div className="e-colophon">
              <h2>Колонтитул</h2>
              <p style={{ fontFamily: 'var(--serif)', fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
                Материал прототипа B1-A. Не является публикацией, не содержит реальных страниц и не подтверждает права
                на издание.
              </p>
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}
