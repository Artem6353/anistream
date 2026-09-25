'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { timeAgo } from '@/lib/format';

type ReviewItem = { id: string; slug: string; name: string; rating: number | null; text: string; ts: number };

/** Блок 4 сайдбара: последние отзывы сообщества (ветка ?limit=N эндпоинта reviews). */
export function RecentReviews() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [local, setLocal] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/social/reviews?limit=5');
        const j = (await r.json()) as { mode: string; items?: ReviewItem[] };
        if (!alive) return;
        const list = Array.isArray(j.items) ? j.items : [];
        if (j.mode !== 'supabase' || !list.length) {
          setLocal(j.mode !== 'supabase');
          setItems([]);
          return;
        }
        setItems(list);
        const slugs = [...new Set(list.map((i) => i.slug))].join(',');
        const tr = await fetch(`/api/titles?slugs=${encodeURIComponent(slugs)}`);
        const tj = (await tr.json()) as { items?: Array<{ slug: string; ru: string; romaji: string }> };
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const it of tj.items ?? []) map[it.slug] = it.ru || it.romaji;
        setNames(map);
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (items === null) return <div className="sidebar-reviews__skeleton" aria-hidden />;
  if (!items.length) {
    return (
      <p className="sidebar-block__empty">
        {local
          ? 'Общие отзывы появятся, когда проект подключат к онлайн-хранилищу.'
          : 'Пока никто не поделился мнением — станьте первым.'}{' '}
        <Link href="/catalog">Выбрать тайтл</Link>
      </p>
    );
  }
  return (
    <ul className="sidebar-reviews">
      {items.map((i) => (
        <li key={i.id} className="sidebar-review">
          <div className="sidebar-review__head">
            <span className="sidebar-review__name">{i.name}</span>
            {typeof i.rating === 'number' ? <span className="sidebar-review__rating">★ {i.rating}</span> : null}
          </div>
          <p className="sidebar-review__text">{i.text}</p>
          <div className="sidebar-review__meta">
            <Link href={`/anime/${i.slug}`}>{names[i.slug] ?? i.slug}</Link>
            <span>{timeAgo(i.ts)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
