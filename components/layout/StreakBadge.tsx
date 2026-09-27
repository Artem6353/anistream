'use client';

import { useEffect, useState } from 'react';
import { readStreak, touchStreak, type StreakState } from '@/lib/streak';
import { trackEvent } from '@/lib/achievements';

/** 🔥 N дней в шапке (ТЗ блок 18.4): тултип с лучшим стриком, акцент при ≥3. */
export function StreakBadge() {
  const [streak, setStreak] = useState<StreakState | null>(null);

  useEffect(() => {
    const s = touchStreak();
    setStreak(s);
    trackEvent('streak', { streak: s.current });
  }, []);

  if (!streak || streak.current < 1) return null;
  return (
    <span
      className={`streak-badge ${streak.current >= 3 ? 'is-hot' : ''}`}
      title={`Ты заходишь ${streak.current} дн. подряд. Лучший — ${streak.best}. Вернись завтра!`}
      aria-label={`Серия посещений: ${streak.current} дней`}
    >
      🔥 {streak.current}
    </span>
  );
}
