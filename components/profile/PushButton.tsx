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

export function PushButton() {
  const [state, setState] = useState<'idle' | 'on'>('idle');
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled && sub) setState('on');
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button
      className="btn btn--outline btn--md"
      onClick={async () => {
        try {
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

          const existing = await reg.pushManager.getSubscription();
          if (existing) {
            await existing.unsubscribe().catch(() => {});
          }

          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });

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
          setState('on');
          toast('Готово: придёт уведомление в день выхода серий');
        } catch (e) {
          console.error('[push] error:', e);
          toast(e instanceof Error ? e.message : 'Push недоступен');
        }
      }}
    >
      {state === 'on' ? 'Пушки включены ✅' : 'Уведомлять о новых сериях'}
    </button>
  );
}