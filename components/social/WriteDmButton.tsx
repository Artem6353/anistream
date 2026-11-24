'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';
import { queueAuthAction } from '@/lib/auth-gate';
import { useToast } from '@/components/ui/Toaster';

const PREVIEW_ROOT = '/preview/aninova-3';

/** «✉️ Написать сообщение» на чужом профиле (ТЗ 20.3, фикс бага 4):
    находит существующий тред или создаёт новый, редиректит в чат,
    все ошибки — тостами. На своём профиле кнопка не рендерится.
    B2-D: preview ведёт в preview-чат, гость — на preview-вход с безопасным next. */
export function WriteDmButton({
  targetId,
  targetName,
  compact,
  preview = false,
}: {
  targetId: string;
  targetName: string;
  compact?: boolean;
  preview?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
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

  const authHref = () => {
    const next = preview && pathname.startsWith(`${PREVIEW_ROOT}/`) ? pathname : `${PREVIEW_ROOT}/profile`;
    return `${PREVIEW_ROOT}/auth?reason=protected&next=${encodeURIComponent(next)}`;
  };

  const open = async () => {
    setBusy(true);
    try {
      const uid = me ?? (await supaWhoami().catch(() => null));
      if (!uid) {
        if (preview) router.push(authHref());
        else toast('Сессия истекла — войдите заново');
        return;
      }
      if (uid === targetId) return;
      const [a, b] = uid < targetId ? [uid, targetId] : [targetId, uid];
      const find = await supaRest('GET', `dm_threads?user_a=eq.${a}&user_b=eq.${b}&select=id&limit=1`);
      if (!find?.ok) throw new Error(`Не удалось найти чат (HTTP ${find?.status ?? 'нет сети'})`);
      let id = ((await find.json()) as Array<{ id: string }>)[0]?.id ?? null;
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
      router.push(preview ? `${PREVIEW_ROOT}/messages/${id}` : `/messages/${id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка открытия чата');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={preview ? (compact ? 'a3-iconbtn review__dm' : 'a3-btn') : compact ? 'icon-btn review__dm' : 'btn btn--outline btn--md'}
      aria-label={`Написать сообщение ${targetName}`}
      title={`Написать сообщение ${targetName}`}
      disabled={busy}
      onClick={() => {
        if (isSessionValid()) void open();
        else if (preview) router.push(authHref());
        else queueAuthAction(open);
      }}
    >
      {busy ? '…' : compact ? '✉️' : `✉️ Написать сообщение ${targetName}`}
    </button>
  );
}
