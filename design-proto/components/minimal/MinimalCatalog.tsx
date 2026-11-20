'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/proto/Icon';
import { Pulse } from '@/components/proto/Pulse';
import { ViewToggle } from '@/components/proto/ViewToggle';
import { anime, catalogFilters } from '@/lib/mock';

const SORTS = [
  { id: 'rating', label: 'По рейтингу' },
  { id: 'year', label: 'По году' },
  { id: 'alpha', label: 'По алфавиту' },
] as const;

/* Каталог Nova Minimal: фильтры работают локально — это демонстрация
   состояний, а не запрос к каталогу. */
export function MinimalCatalog() {
  const [genre, setGenre] = useState('Все');
  const [year, setYear] = useState('Все');
  const [status, setStatus] = useState('Все');
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('rating');

  const list = useMemo(() => {
    const filtered = anime.filter(
      (a) =>
        (genre === 'Все' || a.genres.includes(genre)) &&
        (year === 'Все' || String(a.year) === year) &&
        (status === 'Все' || a.status === status),
    );
    return [...filtered].sort((a, b) => {
      if (sort === 'year') return b.year - a.year;
      if (sort === 'alpha') return a.title.localeCompare(b.title, 'ru');
      return b.rating - a.rating;
    });
  }, [genre, year, status, sort]);

  const dirty = genre !== 'Все' || year !== 'Все' || status !== 'Все';

  return (
    <div className="m-wrap">
      <div className="m-cat">
        <header className="m-cat-head">
          <h1 className="m-title-page">Каталог аниме</h1>
          <p className="m-page-note">
            12 демонстрационных тайтлов. Фильтры и сортировка работают локально, запросов к каталогу нет.
          </p>
        </header>

        <aside className="m-filters" aria-label="Фильтры каталога">
          <div className="m-facet">
            <h3>Жанр</h3>
            <div className="m-chips">
              {['Все', ...catalogFilters.genres].map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`m-chip${genre === g ? ' is-on' : ''}`}
                  aria-pressed={genre === g}
                  onClick={() => setGenre(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="m-facet m-facet--years">
            <h3>Год</h3>
            <div className="m-chips">
              {['Все', ...catalogFilters.years].map((y) => (
                <button
                  key={y}
                  type="button"
                  className={`m-chip${year === y ? ' is-on' : ''}`}
                  aria-pressed={year === y}
                  onClick={() => setYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div className="m-facet">
            <h3>Статус</h3>
            <div className="m-chips">
              {['Все', ...catalogFilters.statuses].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`m-chip${status === s ? ' is-on' : ''}`}
                  aria-pressed={status === s}
                  onClick={() => setStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {dirty ? (
            <button
              type="button"
              className="m-chip"
              onClick={() => {
                setGenre('Все');
                setYear('Все');
                setStatus('Все');
              }}
            >
              Сбросить фильтры
            </button>
          ) : null}
        </aside>

        <div className="m-cat-body">
          <div className="m-toolbar">
            <span className="m-count">
              Найдено <b>{list.length}</b> из {anime.length}
            </span>
            <label className="sr-only" htmlFor="m-sort">
              Сортировка
            </label>
            <select
              id="m-sort"
              className="m-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as (typeof SORTS)[number]['id'])}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <ViewToggle targetId="m-cat-rows" />
          </div>

          <div className="m-cat-rows" id="m-cat-rows" data-view="list">
            {list.map((a) => (
              <Link key={a.slug} className="m-cat-row" href={`/minimal/anime/${a.slug}`}>
                <Image className="m-row-poster" src={a.poster} alt="" width={46} height={69} sizes="46px" />
                <span style={{ minWidth: 0 }}>
                  <span className="m-row-title">{a.title}</span>
                  <span className="m-row-meta">
                    <span style={{ color: 'var(--muted-2)' }}>{a.original}</span>
                    <span>{a.year}</span>
                    <span>{a.episodes > 0 ? `${a.episodes} эп.` : 'анонс'}</span>
                    <span>{a.studio}</span>
                    <span>{a.genres.join(' · ')}</span>
                  </span>
                </span>
                <span className="m-row-side">
                  {a.status === 'Онгоинг' ? (
                    <span className="m-ongoing">
                      <Pulse live size={5} /> Онгоинг
                    </span>
                  ) : (
                    <span>{a.status}</span>
                  )}
                  {a.rating > 0 ? (
                    <span className="m-rating">
                      <Icon name="star" size={11} filled /> {a.rating.toFixed(1)}
                    </span>
                  ) : null}
                </span>
              </Link>
            ))}
          </div>
          {list.length === 0 ? (
            <p className="m-cat-empty">
              Под эти фильтры ничего не подошло. В демо-каталоге 12 тайтлов — сбросьте фильтры.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
