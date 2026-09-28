'use client';

import { useState } from 'react';
import { PosterCard } from '@/components/anime/PosterCard';
import { useLazyTitles } from '@/lib/useLazyTitles';

/** «Топ за неделю / всё время» (ТЗ 18.5) · S2.2: ленивая загрузка — страница передаёт
    только слаги обеих вкладок, тайтлы догружаются /api/titles при скролле до блока
    (один fetch на union слагов). До загрузки — skeleton-сетка (без CLS). */
export function TopTabs({ week, all }: { week: string[]; all: string[] }) {
  const [tab, setTab] = useState<'week' | 'all'>('week');
  const union = [...new Set([...week, ...all])];
  const { sentinel, items, state } = useLazyTitles(union);
  const bySlug = new Map(items.map((t) => [t.slug, t]));
  const pick = (slugs: string[]) => slugs.map((s) => bySlug.get(s)).filter((t) => Boolean(t));
  const list = tab === 'week' ? pick(week) : pick(all);

  if (state === 'error' || (state === 'ready' && !list.length)) return null;

  return (
    <section className="page-section" aria-label="Топ" ref={state === 'ready' ? undefined : sentinel}>
      <div className="rail-head">
        <h2 className="section-title">Топ по оценкам</h2>
        <div className="tabs" role="tablist" aria-label="Период топа">
          <button
            type="button"
            id="toptabs-tab-week"
            role="tab"
            aria-selected={tab === 'week'}
            aria-controls="toptabs-panel"
            className={`tab ${tab === 'week' ? 'is-active' : ''}`}
            onClick={() => setTab('week')}
            disabled={state !== 'ready'}
          >
            За неделю
          </button>
          <button
            type="button"
            id="toptabs-tab-all"
            role="tab"
            aria-selected={tab === 'all'}
            aria-controls="toptabs-panel"
            className={`tab ${tab === 'all' ? 'is-active' : ''}`}
            onClick={() => setTab('all')}
            disabled={state !== 'ready'}
          >
            Всё время
          </button>
        </div>
      </div>
      {/* S3.1/W3C: role=tab требует соответствующий role=tabpanel — обёртка контента */}
      <div
        id="toptabs-panel"
        role="tabpanel"
        aria-labelledby={tab === 'week' ? 'toptabs-tab-week' : 'toptabs-tab-all'}
      >
        {state === 'ready' ? (
          <div className="rail rail--grid">
            {list.map((t) => (
              <PosterCard key={t!.slug} title={t!} />
            ))}
          </div>
        ) : (
          <div className="skeleton-grid" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
