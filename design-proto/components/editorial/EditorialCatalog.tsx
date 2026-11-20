'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/proto/Icon';
import { anime, catalogFilters } from '@/lib/mock';

/* Индекс каталога: не сетка карточек, а алфавитный указатель выпуска.
   Поиск и жанр фильтруют локально, буквы пересобираются на лету. */
export function EditorialCatalog() {
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('Все');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return anime
      .filter((a) => (genre === 'Все' || a.genres.includes(genre)) && (!q || a.title.toLowerCase().includes(q) || a.original.toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }, [query, genre]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((a) => {
      const letter = a.title[0].toUpperCase();
      map.set(letter, [...(map.get(letter) ?? []), a]);
    });
    return [...map.entries()];
  }, [filtered]);

  let counter = 0;

  return (
    <div className="e-wrap">
      <div className="e-catalog">
        <header className="e-cat-head">
          <span className="e-label">Индекс · демо-выпуск</span>
          <h1>Каталог аниме</h1>
          <p>
            Двенадцать тайтлов, расставленных как указатель в конце журнала: по алфавиту, без обложек и рекламных
            плашек. Обложки — на странице тайтла.
          </p>
        </header>

        <div className="e-cat-tools">
          <div className="e-cat-search">
            <Icon name="search" size={16} />
            <label className="sr-only" htmlFor="e-cat-q">
              Поиск по индексу
            </label>
            <input
              id="e-cat-q"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Название или оригинал"
            />
          </div>
          <span className="e-cat-count">
            {filtered.length} из {anime.length}
          </span>
        </div>

        <div className="e-facet-row" role="group" aria-label="Жанр">
          <span>Жанр</span>
          {['Все', ...catalogFilters.genres].map((g) => (
            <button
              key={g}
              type="button"
              className="e-facet"
              aria-pressed={genre === g}
              onClick={() => setGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="e-index-empty">
            В выпуске нет тайтла с таким названием. Попробуйте «Фрирен», «Титанов» или сбросьте жанр.
          </p>
        ) : (
          <div className="e-index">
            {groups.map(([letter, items]) => (
              <section key={letter} aria-label={`Тайтлы на «${letter}»`}>
                <div className="e-letter">
                  <b>{letter}</b>
                  <span>
                    {items.length} {items.length === 1 ? 'тайтл' : 'тайтла'}
                  </span>
                </div>
                {items.map((a) => {
                  counter += 1;
                  return (
                    <Link key={a.slug} href={`/editorial/anime/${a.slug}`} className="e-index-row">
                      <span className="e-index-n">{String(counter).padStart(2, '0')}</span>
                      <h3>
                        {a.title}
                        <em>{a.original}</em>
                      </h3>
                      <span className="e-index-meta">
                        <span>{a.year}</span>
                        <span>{a.episodes > 0 ? `${a.episodes} эп.` : 'анонс'}</span>
                        <span>{a.studio}</span>
                        <b>{a.rating > 0 ? a.rating.toFixed(1) : '—'}</b>
                      </span>
                    </Link>
                  );
                })}
              </section>
            ))}
          </div>
        )}

        <p className="e-label" style={{ marginTop: 20 }}>
          Данные индекса демонстрационные · рейтинги и студии вымышлены
        </p>
      </div>
    </div>
  );
}
