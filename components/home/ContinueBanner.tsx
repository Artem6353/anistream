'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLibrary } from '@/lib/library';
import { formatTime } from '@/lib/format';
import { useTitles } from '@/lib/useTitles';

/** Баннер «Продолжить с MM:SS» сверху главной (ТЗ 18.5): незавершённая серия
    (позиция 30 сек – 90% длительности). «Закрыть» — скрыть до следующей сессии. */
export function ContinueBanner() {
  const { history } = useLibrary();
  const [closed, setClosed] = useState(() => sessionStorage.getItem('anistream:continue-banner') === 'off');
  const entry = history.find((h) => {
    const p = h.position ?? 0;
    const d = h.duration ?? 0;
    return d > 0 && p >= 30 && p < d * 0.9;
  });
  const { bySlug } = useTitles(entry ? [entry.slug] : []);
  if (closed || !entry) return null;
  const t = bySlug.get(entry.slug);
  return (
    <div className="continue-banner" role="region" aria-label="Продолжить просмотр">
      <span className="continue-banner__text">
        {t?.ru ?? entry.slug} · серия {entry.episode} · остановились на {formatTime(entry.position)}
      </span>
      <span className="continue-banner__actions">
        <Link className="btn btn--primary btn--md" href={`/anime/${entry.slug}/${entry.episode}`}>
          Продолжить
        </Link>
        <button
          type="button"
          className="btn btn--ghost btn--md"
          onClick={() => {
            sessionStorage.setItem('anistream:continue-banner', 'off');
            setClosed(true);
          }}
        >
          Закрыть
        </button>
      </span>
    </div>
  );
}
