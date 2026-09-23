'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/Toaster';

/** Подписка на пуши о выходе серий (web-push, VAPID). */
export function PushButton() {
  const [state, setState] = useState<'idle' | 'on'>('idle');
  const toast = useToast();
  return (
    <button
      className="btn btn--outline btn--md"
      onClick={async () => {
        try {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') {
            toast('уведомления запрещены браузером');
            return;
          }
          const { publicKey } = await fetch('/api/push/vapid').then((r) => r.json());
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
          });
          await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
          setState('on');
          toast('Готово: пришлём пуш в день выхода серий');
        } catch (e) {
          toast(e instanceof Error ? e.message : 'push недоступен');
        }
      }}
    >
      {state === 'on' ? 'Пуши включены ✓' : 'Уведомлять о новых сериях'}
    </button>
  );
}
