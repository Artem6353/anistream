'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';
import { queueAuthAction } from '@/lib/auth-gate';
import { useToast } from '@/components/ui/Toaster';

/** «✉️ Написать сообщение» на чужом профиле (ТЗ 20.3, фикс бага 4):
    находит существующий тред или создаёт новый, редиректит в чат,
    все ошибки — тостами. На своём профиле кнопка не рендерится. */
export function WriteDmButton({ targetId, targetName, compact }: { targetId: string; targetName: string; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [me, setMe] = useState<string | null | undefined>(undefined); // undefined = ещё не знаем
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSessionValid()) {
      /* Hydration-safe чтение сессии из localStorage. */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMe(null);
      return;
    }
    supaWhoami()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === targetId) return null; // свой профиль — кнопка не нужна

  const open = async () => {
    setBusy(true);
    try {
      const uid = me ?? (await supaWhoami().catch(() => null));
      if (!uid) {
        toast('Сессия истекла — войдите заново');
        return;
      }
      if (uid === targetId) return;
      const [a, b] = uid < targetId ? [uid, targetId] : [targetId, uid];
      const find = await supaRest('GET', `dm_threads?user_a=eq.${a}&user_b=eq.${b}&select=id&limit=1`);
      let id = find?.ok ? ((await find.json()) as Array<{ id: string }>)[0]?.id : null;
      if (!id) {
        const ins = await supaRest('POST', 'dm_threads', { user_a: a, user_b: b });
        if (!ins?.ok) {
          toast(`Не удалось создать чат (HTTP ${ins?.status ?? 'нет сети'})`);
          return;
        }
        id = ((await ins.json()) as Array<{ id: string }>)[0]?.id ?? null;
      }
      if (!id) {
        toast('Тред не создался — проверьте миграцию 008 (dm_threads)');
        return;
      }
      router.push(`/messages/${id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка открытия чата');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={compact ? 'icon-btn review__dm' : 'btn btn--outline btn--md'}
      aria-label={`Написать сообщение ${targetName}`}
      title={`Написать сообщение ${targetName}`}
      disabled={busy}
      onClick={() => {
        if (isSessionValid()) open();
        else queueAuthAction(open);
      }}
    >
      {busy ? '…' : compact ? '✉️' : `✉️ Написать сообщение ${targetName}`}
    </button>
  );
}
