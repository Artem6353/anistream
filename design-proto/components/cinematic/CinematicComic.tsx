import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/proto/Icon';
import { SaveButton } from '@/components/proto/SaveButton';
import { chaptersOf, type Comic } from '@/lib/mock';

export function CinematicComic({ item }: { item: Comic }) {
  const chapters = chaptersOf(item.slug);

  return (
    <div className="c-main">
      <div className="c-wrap">
        <div className="c-comic-hero">
          <div className="c-comic-cover-wrap">
            <Image
              src={item.cover}
              alt={`Обложка: ${item.title}`}
              width={400}
              height={600}
              sizes="(max-width: 599px) 136px, 200px"
              priority
            />
          </div>
          <div className="c-comic-info">
            <span className="c-label">Графический роман · только RU · {item.year}</span>
            <h1 className="c-display c-display--page" style={{ fontSize: 'clamp(26px, 4.4vw, 52px)' }}>
              {item.title}
            </h1>
            <div className="c-hero-meta" style={{ color: 'var(--muted)' }}>
              <span>{item.author}</span>
              <span>художник {item.artist}</span>
              <span className="c-chip">{item.rated}</span>
              <span className="c-chip">{item.status}</span>
              <span className="c-chip">RU</span>
            </div>
            <p>{item.synopsis}</p>
            <div className="c-hero-actions">
              <Link className="c-btn c-btn--primary" href={`/cinematic/comics/${item.slug}/read`}>
                <Icon name="book" size={15} /> Читать главу {item.progress?.chapter ?? 1}
              </Link>
              <SaveButton className="c-btn" label="В библиотеку" />
            </div>
          </div>
        </div>

        <dl className="c-strip" style={{ marginTop: 1 }}>
          <div className="c-strip-cell">
            <dt>Автор</dt>
            <dd>{item.author}</dd>
          </div>
          <div className="c-strip-cell">
            <dt>Художник</dt>
            <dd>{item.artist}</dd>
          </div>
          <div className="c-strip-cell">
            <dt>Глав</dt>
            <dd>{item.chapters}</dd>
          </div>
          <div className="c-strip-cell">
            <dt>Язык</dt>
            <dd>Русский</dd>
          </div>
        </dl>

        <section className="c-section" aria-labelledby="c-chapters">
          <div className="c-section-head">
            <h2 id="c-chapters">Главы</h2>
            <span className="c-label">сначала новые</span>
          </div>
          <div className="c-chapter-tiles">
            {chapters.map((c) => (
              <Link key={c.n} className="c-chapter-tile" href={`/cinematic/comics/${item.slug}/read`}>
                <b>{String(c.n).padStart(2, '0')}</b>
                <span>
                  {c.title}
                  {c.new ? ' · new' : ''}
                </span>
                <em>
                  {c.pages} стр. · {c.date}
                </em>
              </Link>
            ))}
          </div>
          <p className="c-label" style={{ marginTop: 16, lineHeight: 1.7 }}>
            Демо-главы: читалка открывает четыре страницы. Права на издание в production проверяются отдельно.
          </p>
        </section>
      </div>
    </div>
  );
}
