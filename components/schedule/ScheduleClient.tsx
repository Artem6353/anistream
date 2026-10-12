'use client';

import { useEffect, useState } from 'react';
import type { ScheduleEntry } from '@/lib/types';
import type { ScheduleSource } from '@/lib/schedule';
import { ScheduleBoard, TodayList } from './ScheduleBoard';

/**
 * Прогрессивное расписание (аудит 2026-10, ТЗ 1.1): SSR отдаёт РЕАЛЬНЫЕ данные из
 * таблицы airing_schedule, клиент только освежает их через /api/schedule.
 * Демо-набора больше нет — раньше SSR рисовал фейковую неделю из хеша слага,
 * а клиент её заменял только при удачном ответе AniList (что на Vercel почти
 * всегда заканчивалось 429).
 */
export function ScheduleClient({
  mode,
  fallback,
  source,
}: {
  mode: 'week' | 'today';
  fallback: ScheduleEntry[];
  source: ScheduleSource;
  freshAt?: number | null;
}) {
  const [entries, setEntries] = useState(fallback);
  const [origin, setOrigin] = useState<ScheduleSource>(source);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/schedule')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json || !Array.isArray(json.entries)) return;
        setEntries(json.entries);
        if (json.source === 'db' || json.source === 'catalog') setOrigin(json.source);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return mode === 'week' ? <ScheduleBoard entries={entries} source={origin} /> : <TodayList entries={entries} source={origin} />;
}
