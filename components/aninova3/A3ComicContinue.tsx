'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEMO_COMICS } from '@/lib/aninova3/comics-demo';

interface Progress {
  slug: string;
  chapter: number;
  page: number;
  updatedAt: number;
}

const KEY = 'a3:comic-progress';

export function A3ComicContinue() {
  const [item, setItem] = useState<{ progress: Progress; title: string } | null>(null);

  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Progress[];
      const last = all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!last) return;
      const comic = DEMO_COMICS.find((c) => c.slug === last.slug);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- прогресс читалки из localStorage
      if (comic) setItem({ progress: last, title: comic.title });
    } catch {}
  }, []);

  if (!item) return null;
  return (
    <Link className="a3-comic-continue" href={`/preview/aninova-3/comics/${item.progress.slug}/read?page=${item.progress.page}`}>
      <span className="a3-comic-continue__label">Продолжить чтение</span>
      <span className="a3-comic-continue__title">{item.title}</span>
      <span className="a3-muted">
        Глава {item.progress.chapter} · страница {item.progress.page}
      </span>
    </Link>
  );
}

export function saveComicProgress(progress: Progress) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Progress[];
    const next = [progress, ...all.filter((p) => p.slug !== progress.slug)].slice(0, 12);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}
