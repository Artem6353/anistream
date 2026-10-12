'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supaRest } from '@/lib/sync';

interface Cat {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  threads?: number;
}

/** Форум: список разделов (ТЗ 20.5). */
export default function ForumPage() {
  const [cats, setCats] = useState<Cat[]>([]);
  useEffect(() => {
    (async () => {
      const [cr, tr] = await Promise.all([
        supaRest('GET', 'forum_categories?select=id,slug,name,description&order=id.asc').catch(() => null),
        supaRest('GET', 'forum_threads?select=category_id').catch(() => null),
      ]);
      const list = cr?.ok ? ((await cr.json()) as Cat[]) : [];
      const threads = tr?.ok ? ((await tr.json()) as Array<{ category_id: number }>) : [];
      const counts = new Map<number, number>();
      for (const t of threads) counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
      setCats(list.map((c) => ({ ...c, threads: counts.get(c.id) ?? 0 })));
    })();
  }, []);
  return (
    <div className="container forum">
      <h1>Форум</h1>
      <div className="clubs__list">
        {cats.map((c) => (
          <Link className="collection-card" key={c.id} href={`/forum/${c.slug}`}>
            <strong>{c.name}</strong>
            <span>{c.description}</span>
            <span>{c.threads ?? 0} тредов</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
