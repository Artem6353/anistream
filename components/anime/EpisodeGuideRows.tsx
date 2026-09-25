'use client';

import { useState } from 'react';

export interface EpisodeGuideRow {
  ep: string;
  name: string;
  date: string;
  time: string;
  status: string;
}

/**
 * ТЗ 4.1 (4.4): «График выхода серий» — аккордеон без внутреннего скролла.
 * По умолчанию первые 8 серий; кнопка «Показать все (N)» внизу (ghost) разворачивает
 * полный список, повторный клик — сворачивает. Строки считает серверный EpisodeGuide.
 */
export function EpisodeGuideRows({ rows }: { rows: EpisodeGuideRow[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 8);

  return (
    <>
      <table className="epguide__table">
        <thead>
          <tr>
            <th>№</th>
            <th>Название</th>
            <th>Дата выхода</th>
            <th>Время</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={`${r.ep}-${r.name}`}>
              <td>{r.ep === '—' ? '—' : `${r.ep} серия`}</td>
              <td>{r.name ?? `Episode ${r.ep}`}</td>
              <td>{r.date}</td>
              <td>{r.time || '—'}</td>
              <td>
                <span className={`epguide__status ${r.status === 'вышла' ? 'is-done' : 'is-wait'}`}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 8 ? (
        <button type="button" className="btn btn--ghost btn--sm epguide__showall" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Свернуть' : `Показать все (${rows.length})`}
        </button>
      ) : null}
    </>
  );
}
