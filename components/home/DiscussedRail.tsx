'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTitles } from '@/lib/useTitles';
import { PosterArt } from '@/components/anime/PosterArt';

interface DiscussedItem {
  id: string;
  slug: string;
  name: string;
  text: string;
  comments: number;
}

/** «Сейчас обсуждают» (ТЗ 18.5): топ-10 отзывов за 24 ч с ≥1 комментарием. */
export function DiscussedRail() {
  const [items, setItems] = useState<DiscussedItem[]>([]);
  useEffect(() => {
    fetch('/api/social/reviews?discussed=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setItems((j?.items ?? []).slice(0, 10)))
      .catch(() => {});
  }, []);
  const slugs = [...new Set(items.map((i) => i.slug))];
  const { bySlug } = useTitles(slugs);
  if (!items.length) return null;
  return (
    <section className="page-section" aria-label="Сейчас обсуждают">
      <div className="rail-head">
        <h2 className="section-title">Сейчас обсуждают</h2>
      </div>
      <div className="discussed">
        {items.map((i) => {
          const t = bySlug.get(i.slug);
          return (
            <Link className="discussed__card" key={i.id} href={`/anime/${i.slug}#reviews`}>
              <span className="discussed__poster">
                <PosterArt src={t?.poster} seed={i.slug} initials={t?.romaji ?? i.slug} alt="" />
              </span>
              <span className="discussed__body">
                <strong>{t?.ru ?? i.slug}</strong>
                <span className="discussed__quote">«{i.text.slice(0, 60)}…»</span>
                <span className="discussed__meta">
                  {i.name} · {i.comments} {i.comments === 1 ? 'комментарий' : 'комментариев'}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
