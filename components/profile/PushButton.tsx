'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toaster';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

async function swReady(timeoutMs = 8000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function deleteFromServer(endpoint: string): Promise<void> {
  try {
    await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
    });
  } catch {
    /* молча: не блокируем основной флоу */
  }
}

export function PushButton() {
  const [state, setState] = useState<'idle' | 'on' | 'denied'>('idle');
  const toast = useToast();

  // Баг 6: состояние = РЕАЛЬНОЕ состояние браузера (pushManager.getSubscription),
  // а не флаг/localStorage. Перепроверяется при монтировании, по visibilitychange
  // и после каждой операции. Подписка привязана к браузеру, не к аккаунту.
  const ownerKey = 'anistream:push_owner'; // uid владельца подписки или 'anon' (новый ключ, существующие не трогаем)
  const currentOwner = () => {
    try {
      const token = localStorage.getItem('anistream:supa_token');
      if (!token) return 'anon';
      const json = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof json.sub === 'string' ? json.sub : 'anon';
    } catch {
      return 'anon';
    }
  };
  const syncState = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      // аудит P2-4: permission denied — отдельное состояние с объяснением
      if ('Notification' in window && Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      const reg = await swReady(4000);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      // «включено» показываем только владельцу подписки: вышел из аккаунта → кнопка снова «Уведомлять»
      const mine = sub && (localStorage.getItem(ownerKey) ?? 'anon') === currentOwner();
      setState(mine ? 'on' : 'idle');
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    syncState();
    document.addEventListener('visibilitychange', syncState);
    window.addEventListener('anistream:auth-change', syncState);
    return () => {
      document.removeEventListener('visibilitychange', syncState);
      window.removeEventListener('anistream:auth-change', syncState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      className="btn btn--outline btn--md"
      onClick={async () => {
        try {
          // Баг 6: повторный клик по «включено» = ОТПИСКА (раньше кнопка пересоздавала подписку)
          if (state === 'on') {
            const reg = await swReady(4000);
            const existing = reg ? await reg.pushManager.getSubscription() : null;
            if (existing) {
              const endpoint = existing.endpoint;
              await existing.unsubscribe().catch(() => {});
              await deleteFromServer(endpoint);
            }
            try {
              localStorage.removeItem(ownerKey);
            } catch {}
            setState('idle');
            toast('Вы отписались от уведомлений');
            return;
          }
          if (!('Notification' in window)) {
            toast('Браузер не поддерживает уведомления');
            return;
          }
          if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            toast('Push недоступен в этом браузере');
            return;
          }

          const perm = await Notification.requestPermission();
          if (perm !== 'granted') {
            toast('Уведомления запрещены браузером');
            return;
          }

          const reg = await swReady();
          if (!reg) {
            console.error('[push] serviceWorker.ready не дождались');
            toast('Service Worker не активен — обновите страницу');
            return;
          }

          const r = await fetch('/api/push/vapid');
          if (!r.ok) {
            toast('Не удалось получить VAPID-ключ');
            return;
          }
          const { publicKey } = (await r.json()) as { publicKey?: string };
          if (!publicKey) {
            console.error('[push] vapid пустой');
            toast('VAPID-ключ не настроен на сервере');
            return;
          }

          // чужая/старая подписка браузера (другой аккаунт владел) — снимаем перед новой
          const stale = await reg.pushManager.getSubscription();
          if (stale) {
            const oldEndpoint = stale.endpoint;
            await stale.unsubscribe().catch(() => {});
            await deleteFromServer(oldEndpoint);
          }

          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
          try {
            localStorage.setItem(ownerKey, currentOwner());
          } catch {}

          const resp = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub.toJSON()),
          });
          if (!resp.ok) {
            console.error('[push] subscribe failed', resp.status, await resp.text());
            toast(`Сервер отклонил подписку (${resp.status})`);
            return;
          }
          await syncState();
          toast('Готово: придёт уведомление в день выхода серий');
        } catch (e) {
          console.error('[push] error:', e);
          toast(e instanceof Error ? e.message : 'Push недоступен');
        }
      }}
    >
      {state === 'on'
        ? 'Пушки включены ✅'
        : state === 'denied'
          ? 'Уведомления запрещены браузером — разрешите их в настройках сайта'
          : 'Уведомлять о новых сериях'}
    </button>
  );
}