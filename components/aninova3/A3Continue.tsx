'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/lib/library';
import { PosterArt } from '@/components/anime/PosterArt';

const ROOT = '/preview/aninova-3';

interface Row {
  slug: string;
  ru: string;
  poster: string;
  romaji: string;
}

/** «Продолжить просмотр» из реальной локальной истории (lib/library), не из моков. */
export function A3Continue() {
  const { history } = useLibrary();
  const [rows, setRows] = useState<Row[]>([]);
  const entries = history.filter((h) => h.duration > 0 && h.position / h.duration < 0.98).slice(0, 8);
  const key = entries.map((e) => e.slug).join(',');

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/api/titles?slugs=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: Row[] }) => setRows(data.items ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [key]);

  if (!entries.length) return null;

  return (
    <section className="a3-section" aria-labelledby="a3-continue-title" data-a3-group="continue">
      <div className="a3-wrap a3-section__head">
        <h2 className="a3-h2" id="a3-continue-title">
          Продолжить просмотр
        </h2>
        <Link className="a3-link" href={`${ROOT}/profile`}>
          Вся история →
        </Link>
      </div>
      <div className="a3-rail a3-rail--wide">
        {entries.map((entry) => {
          const row = rows.find((r) => r.slug === entry.slug);
          const pct = Math.round((entry.position / entry.duration) * 100);
          return (
            <Link key={`${entry.slug}-${entry.episode}`} className="a3-continue" href={`${ROOT}/anime/${entry.slug}/${entry.episode}`}>
              <span className="a3-continue__art">
                {row ? <PosterArt src={row.poster} seed={row.slug} initials={row.romaji} alt="" width={120} /> : null}
                <span className="a3-continue__pct">{pct}%</span>
              </span>
              <span className="a3-continue__body">
                <span className="a3-continue__title">{row?.ru ?? entry.slug}</span>
                <span className="a3-muted">Серия {entry.episode}</span>
                <span className="a3-progress" aria-hidden>
                  <span style={{ width: `${Math.min(100, pct)}%` }} />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
