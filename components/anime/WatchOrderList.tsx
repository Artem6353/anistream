'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface WatchOrderItem {
  slug: string;
  ru: string;
  typeLabel: string;
  year: number | string;
  relLabel?: string;
  isCurrent: boolean;
}

/**
 * ТЗ 4.1 (4.3): «Порядок просмотра» — аккордеон.
 * По умолчанию первые 5 тайтлов; кнопка «Показать всё (N)» разворачивает полный,
 * повторный клик — сворачивает. Активная строка («вы здесь») — accent-подсветка.
 * Данные считает серверный WatchOrder (lib/franchise + lib/catalog остаются на сервере).
 */
export function WatchOrderList({ items }: { items: WatchOrderItem[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, 5);

  return (
    <ol className="watchorder__list">
      {shown.map((t, i) => (
        <li key={t.slug} className={`watchorder__item ${t.isCurrent ? 'is-current' : ''}`}>
          <span className="watchorder__num">{i + 1}</span>
          <span className="watchorder__body">
            <Link href={`/anime/${t.slug}`}>{t.ru}</Link>
            <span className="watchorder__meta">
              {t.typeLabel} · {t.year}
              {t.relLabel ? ` · ${t.relLabel}` : ''}
            </span>
          </span>
          {t.isCurrent ? <span className="player-flag player-flag--ok">вы здесь</span> : null}
        </li>
      ))}
      {items.length > 5 ? (
        <li className="watchorder__more">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Свернуть' : `Показать всё (${items.length})`}
          </button>
        </li>
      ) : null}
    </ol>
  );
}
