'use client';

/** Streak 🔥 (ТЗ блок 18.4): anistream:streak = { current, best, lastVisit } (ключ не переименовывать).
    Логика захода: сегодня — ничего; вчера — current+1; иначе сброс в 1. */
export interface StreakState {
  current: number;
  best: number;
  lastVisit: string; // yyyy-mm-dd
}

import { scopedKey } from './library';

// стрик привязан к аккаунту: свой ключ на каждый uid (аноним — базовый ключ)
const K = () => scopedKey('anistream:streak');
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function readStreak(): StreakState | null {
  try {
    return JSON.parse(localStorage.getItem(K()) ?? 'null') as StreakState | null;
  } catch {
    return null;
  }
}

export function touchStreak(): StreakState {
  const today = dayKey(new Date());
  const prev = readStreak();
  let next: StreakState;
  if (!prev || !prev.lastVisit) {
    next = { current: 1, best: Math.max(prev?.best ?? 0, 1), lastVisit: today };
  } else if (prev.lastVisit === today) {
    next = prev;
  } else {
    const yesterday = dayKey(new Date(Date.now() - 86400_000));
    const current = prev.lastVisit === yesterday ? prev.current + 1 : 1;
    next = { current, best: Math.max(prev.best ?? 0, current), lastVisit: today };
  }
  try {
    localStorage.setItem(K(), JSON.stringify(next));
  } catch {}
  return next;
}
