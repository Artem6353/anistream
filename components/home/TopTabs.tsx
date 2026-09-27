'use client';

import { useState } from 'react';
import type { Title } from '@/lib/types';
import { PosterCard } from '@/components/anime/PosterCard';

/** «Топ за неделю / всё время» (ТЗ 18.5): таб над топовым рейлом, по умолчанию «за неделю». */
export function TopTabs({ week, all }: { week: Title[]; all: Title[] }) {
  const [tab, setTab] = useState<'week' | 'all'>('week');
  const list = tab === 'week' ? week : all;
  return (
    <section className="page-section" aria-label="Топ">
      <div className="rail-head">
        <h2 className="section-title">Топ по оценкам</h2>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'week'} className={`tab ${tab === 'week' ? 'is-active' : ''}`} onClick={() => setTab('week')}>
            За неделю
          </button>
          <button type="button" role="tab" aria-selected={tab === 'all'} className={`tab ${tab === 'all' ? 'is-active' : ''}`} onClick={() => setTab('all')}>
            Всё время
          </button>
        </div>
      </div>
      <div className="rail rail--grid">
        {list.map((t) => (
          <PosterCard key={t.slug} title={t} />
        ))}
      </div>
    </section>
  );
}
