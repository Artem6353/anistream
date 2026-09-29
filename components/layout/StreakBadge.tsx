'use client';

import { useEffect, useState } from 'react';
import { touchStreak, type StreakState } from '@/lib/streak';
import { trackEvent } from '@/lib/achievements';
import { AUTH_CHANGE_EVENT } from '@/lib/auth-gate';
import { isSessionValid } from '@/lib/sync';

/** 🔥 N дней в шапке (ТЗ блок 18.4): тултип с лучшим стриком, акцент при ≥3.
    Баг 29.09: стрик — фича зарегистрированных; разлогиненному посетителю бейдж
    не показываем и стрик не трогаем; перечитываем по событию входа/выхода. */
export function StreakBadge() {
  const [streak, setStreak] = useState<StreakState | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (!isSessionValid()) {
        setStreak(null);
        return;
      }
      const s = touchStreak();
      setStreak(s);
      trackEvent('streak', { streak: s.current });
    };
    refresh();
    window.addEventListener(AUTH_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(AUTH_CHANGE_EVENT, refresh);
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
