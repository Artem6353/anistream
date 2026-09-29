'use client';

/** Баг 29.09: «статистика/достижения/стрик/уведомления не сбрасываются при выходе».
    При выходе очищается АНОНИМНЫЙ скоуп (базовые ключи без :uid) — то, что увидит
    разлогиненный посетитель: стрик, ачивки и их счётчики, списки/история/закладки
    (из истории считается статистика и бейдж закладок в шапке).
    Аккаунтные ключи (`…:<uid>`) НЕ трогаем — данные ждут повторного входа. */
const ANON_KEYS = [
  'anistream:streak',
  'anistream:achievements',
  'anistream:ach_counters',
  'anistream:ach_genres',
  'anistream:ach_extra',
  'anistream:ach_watched',
  'anistream:bookmarks',
  'anistream:history',
  'anistream:lists',
];

export function resetAnonSession(): void {
  try {
    for (const k of ANON_KEYS) localStorage.removeItem(k);
  } catch {
    /* private mode и т.п. */
  }
}

/** Пуш-подписка живёт в браузере, а не в аккаунте — при выходе отписываемся
    и удаляем endpoint на сервере, чтобы «уведомления сбрасывались». */
export async function unsubscribePush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' }).catch(() => {});
  } catch {
    /* молча: не блокируем выход */
  }
}
