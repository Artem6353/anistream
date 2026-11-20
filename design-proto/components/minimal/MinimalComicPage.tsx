import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { SaveButton } from '@/components/proto/SaveButton';
import { chaptersOf, type Comic } from '@/lib/mock';

export function MinimalComicPage({ item }: { item: Comic }) {
  const chapters = chaptersOf(item.slug);
  const current = item.progress;

  return (
    <div className="m-wrap">
      <div style={{ padding: '20px 0 56px' }}>
        <nav className="m-crumbs" aria-label="Хлебные крошки">
          <Link href="/minimal">Главная</Link>
          <span aria-hidden="true">/</span>
          <Link href="/minimal/comics">Комиксы</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{item.title}</span>
        </nav>

        <div className="m-comic-hero">
          <Image
            className="m-comic-cover-lg"
            src={item.cover}
            alt={`Обложка: ${item.title}`}
            width={168}
            height={252}
            sizes="(max-width: 768px) 148px, 168px"
            priority
          />
          <div>
            <h1 className="m-anime-title">{item.title}</h1>
            <p className="m-anime-original">
              {item.author} · художник {item.artist}
            </p>
            <div className="m-meta">
              <span>{item.year}</span>
              <span className="m-pill">{item.rated}</span>
              <span className="m-pill m-pill--ok">RU</span>
              <span className="m-pill">{item.status}</span>
              <span>{item.chapters} глав</span>
            </div>
            <p className="m-synopsis" style={{ marginTop: 16 }}>
              {item.synopsis}
            </p>
            <div className="m-anime-actions">
              <Link className="m-btn m-btn--primary" href={`/minimal/comics/${item.slug}/read`}>
                <Icon name="book" size={15} /> Читать главу {current?.chapter ?? 1}
              </Link>
              <SaveButton className="m-btn" label="В библиотеку" />
            </div>
          </div>
        </div>

        <div className="m-comic-layout">
          <section aria-labelledby="m-chapters">
            <div className="m-section-head">
              <h2 className="m-block-title" id="m-chapters" style={{ marginBottom: 0 }}>
                Главы · {chapters.length}
              </h2>
              <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>сначала новые</span>
            </div>
            <div style={{ borderTop: '1px solid var(--line-soft)' }}>
              {chapters.map((c) => (
                <Link key={c.n} className="m-chapter-row" href={`/minimal/comics/${item.slug}/read`}>
                  <span style={{ minWidth: 0 }}>
                    <span className="m-row-title" style={{ fontSize: 13.5 }}>
                      {c.n}. {c.title}
                    </span>
                    <span className="m-row-meta">
                      <span>{c.pages} страниц</span>
                      <span>{c.date}</span>
                    </span>
                  </span>
                  {c.new ? <span className="m-new-badge">new</span> : <span />}
                  <Icon name="right" size={14} />
                </Link>
              ))}
            </div>
          </section>

          <aside className="m-side-card" aria-labelledby="m-comic-facts">
            <h2 className="m-block-title" id="m-comic-facts" style={{ marginBottom: 8 }}>
              Об издании
            </h2>
            <dl className="m-spec" style={{ marginTop: 0, gridTemplateColumns: 'minmax(0,1fr)' }}>
              <div className="m-spec-cell">
                <dt>Автор</dt>
                <dd>{item.author}</dd>
              </div>
              <div className="m-spec-cell">
                <dt>Художник</dt>
                <dd>{item.artist}</dd>
              </div>
              <div className="m-spec-cell">
                <dt>Язык</dt>
                <dd>Русский (обязательно)</dd>
              </div>
              <div className="m-spec-cell">
                <dt>Права</dt>
                <dd>Демо-лицензия, не production</dd>
              </div>
              <div className="m-spec-cell">
                <dt>Обновление</dt>
                <dd>{item.updated}</dd>
              </div>
            </dl>
            {current ? (
              <p className="m-demo-note" style={{ marginTop: 12 }}>
                Вы остановились на главе {current.chapter}, страница {current.page} из {current.pages}.
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
