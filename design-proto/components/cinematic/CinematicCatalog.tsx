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

export function CinematicCatalog() {
  const [genre, setGenre] = useState('Все');
  const [status, setStatus] = useState('Все');
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('rating');

  const list = useMemo(() => {
    const filtered = anime.filter(
      (a) => (genre === 'Все' || a.genres.includes(genre)) && (status === 'Все' || a.status === status),
    );
    return [...filtered].sort((a, b) => {
      if (sort === 'year') return b.year - a.year;
      if (sort === 'alpha') return a.title.localeCompare(b.title, 'ru');
      return b.rating - a.rating;
    });
  }, [genre, status, sort]);

  return (
    <div className="c-wrap">
      <div className="c-catalog">
        <header className="c-page-head">
          <span className="c-label">
            <Pulse size={5} /> каталог · демо
          </span>
          <h1 className="c-display c-display--page">Каталог</h1>
          <p>12 демонстрационных тайтлов. Фильтры локальные: сетка перестраивается без запросов к каталогу.</p>
        </header>

        <div className="c-filters" role="group" aria-label="Жанр">
          {['Все', ...catalogFilters.genres].map((g) => (
            <button
              key={g}
              type="button"
              className="c-chip"
              aria-pressed={genre === g}
              onClick={() => setGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="c-cat-meta">
          <span>
            {list.length} из {anime.length}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="sr-only" htmlFor="c-sort">
              Сортировка
            </label>
            <select id="c-sort" value={sort} onChange={(e) => setSort(e.target.value as (typeof SORTS)[number]['id'])}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="c-status">
              Статус
            </label>
            <select id="c-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {['Все', ...catalogFilters.statuses].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ViewToggle targetId="c-cat-grid" initial="grid" />
          </div>
        </div>

        <div className="c-cat-grid" id="c-cat-grid" data-view="grid">
          {list.map((a) => (
            <Link key={a.slug} href={`/cinematic/anime/${a.slug}`} className="c-poster-card">
              <span className="c-poster-art">
                <Image
                  src={a.poster}
                  alt={`Обложка: ${a.title}`}
                  width={240}
                  height={360}
                  sizes="(max-width: 600px) 45vw, (max-width: 900px) 30vw, (max-width: 1200px) 23vw, 15vw"
                />
                <span className="c-still-rating">{a.rating > 0 ? `★ ${a.rating.toFixed(1)}` : 'анонс'}</span>
              </span>
              <b>{a.title}</b>
              <span>
                {a.year} · {a.genres[0]}
              </span>
              <span className="c-score">{a.rating > 0 ? a.rating.toFixed(1) : '—'}</span>
            </Link>
          ))}
        </div>

        {list.length === 0 ? (
          <p className="c-empty">
            Пусто. В демо-каталоге 12 тайтлов — выберите другой жанр или статус.{' '}
            <button
              type="button"
              className="c-chip"
              onClick={() => {
                setGenre('Все');
                setStatus('Все');
              }}
              style={{ marginLeft: 8 }}
            >
              Сбросить
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
