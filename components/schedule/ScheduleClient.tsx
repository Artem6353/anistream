'use client';

import { useEffect, useState } from 'react';
import type { ScheduleEntry } from '@/lib/types';
import { ScheduleBoard, TodayList } from './ScheduleBoard';

/**
 * Прогрессивное расписание: SSR отдаёт детерминированный демо-набор (работает
 * офлайн), затем клиент подтягивает живые данные AniList через /api/schedule.
 */
export function ScheduleClient({
  mode,
  fallback,
}: {
  mode: 'week' | 'today';
  fallback: ScheduleEntry[];
}) {
  const [entries, setEntries] = useState(fallback);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/schedule')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        if (json.live && Array.isArray(json.entries) && json.entries.length) {
          setEntries(json.entries);
          setLive(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return mode === 'week' ? <ScheduleBoard entries={entries} live={live} /> : <TodayList entries={entries} live={live} />;
}
