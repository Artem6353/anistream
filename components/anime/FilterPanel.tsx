import { GENRE_LABELS, SORT_LABELS, STATUS_LABELS, TYPE_LABELS } from '@/lib/labels';
import { genreStats, yearsAvailable } from '@/lib/catalog';
import type { CatalogQuery } from '@/lib/types';
import { SortSelect } from './SortSelect';

/** Панель фильтров каталога: обычный GET-форма — работает без JS. */
export function FilterPanel({ query }: { query: CatalogQuery }) {
  const genres = genreStats();
  const years = yearsAvailable();

  return (
    <form className="filters" method="GET" action="/catalog" role="search" aria-label="Фильтры каталога">
      <div className="filters__row">
        <label className="field">
          <span className="field__label">Поиск</span>
          <input className="input" type="search" name="q" defaultValue={query.q ?? ''} placeholder="Название или жанр" />
        </label>
        <label className="field field--sort">
          <span className="field__label">Сортировка</span>
          <SortSelect value={query.sort ?? 'pop'} labels={SORT_LABELS} />
        </label>
      </div>

      <fieldset className="filters__group">
        <legend className="field__label">Жанры</legend>
        <div className="chips chips--check">
          {genres.map((g) => (
            <label key={g.slug} className={`chip chip--check ${query.genres?.includes(g.slug) ? 'is-active' : ''}`}>
              <input type="checkbox" name="genre" value={g.slug} defaultChecked={query.genres?.includes(g.slug)} />
              <span>{GENRE_LABELS[g.slug] ?? g.slug}</span>
              <em>{g.count}</em>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="filters__row">
        <fieldset className="filters__group filters__group--inline">
          <legend className="field__label">Тип</legend>
          <div className="chips chips--check">
            <label className={`chip chip--check ${!query.type ? 'is-active' : ''}`}>
              <input type="radio" name="type" value="" defaultChecked={!query.type} />
              <span>Все</span>
            </label>
            {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((t) => (
              <label key={t} className={`chip chip--check ${query.type === t ? 'is-active' : ''}`}>
                <input type="radio" name="type" value={t} defaultChecked={query.type === t} />
                <span>{TYPE_LABELS[t]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="filters__group filters__group--inline">
          <legend className="field__label">Статус</legend>
          <div className="chips chips--check">
            <label className={`chip chip--check ${!query.status ? 'is-active' : ''}`}>
              <input type="radio" name="status" value="" defaultChecked={!query.status} />
              <span>Любой</span>
            </label>
            {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((s) => (
              <label key={s} className={`chip chip--check ${query.status === s ? 'is-active' : ''}`}>
                <input type="radio" name="status" value={s} defaultChecked={query.status === s} />
                <span>{STATUS_LABELS[s]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field field--year">
          <span className="field__label">Год</span>
          <select className="input" name="year" defaultValue={query.year ?? ''}>
            <option value="">Все годы</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="filters__actions">
        <button className="btn btn--primary btn--md" type="submit">
          Применить
        </button>
        <a className="btn btn--ghost btn--md" href="/catalog">
          Сбросить
        </a>
      </div>
    </form>
  );
}
