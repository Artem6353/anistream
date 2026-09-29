'use client';

/** Баг 29.09 → откат 30.09 по запросу владельца: закладки/список/история гостя
    НЕ стираются (живут в localStorage постоянно, переживают перезагрузки и
    повторные заходы). При выходе очищается только геймификация анонима:
    стрик и ачивки со счётчиками. Аккаунтные ключи (`…:<uid>`) не трогаем. */
const ANON_KEYS = [
  'anistream:streak',
  'anistream:achievements',
  'anistream:ach_counters',
  'anistream:ach_genres',
  'anistream:ach_extra',
  'anistream:ach_watched',
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
