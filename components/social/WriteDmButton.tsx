'use client';

import { useRouter } from 'next/navigation';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';
import { queueAuthAction } from '@/lib/auth-gate';
import { useToast } from '@/components/ui/Toaster';

/** «Написать сообщение» на чужом профиле (ТЗ 20.3): находит/создаёт тред и открывает чат. */
export function WriteDmButton({ targetId, targetName }: { targetId: string; targetName: string }) {
  const router = useRouter();
  const toast = useToast();

  const open = async () => {
    const me = await supaWhoami().catch(() => null);
    if (!me) return;
    if (me === targetId) return;
    const [a, b] = me < targetId ? [me, targetId] : [targetId, me];
    const find = await supaRest('GET', `dm_threads?user_a=eq.${a}&user_b=eq.${b}&select=id&limit=1`);
    let id = find?.ok ? ((await find.json()) as Array<{ id: string }>)[0]?.id : null;
    if (!id) {
      const ins = await supaRest('POST', 'dm_threads', { user_a: a, user_b: b });
      id = ins?.ok ? ((await ins.json()) as Array<{ id: string }>)[0]?.id : null;
    }
    if (!id) {
      toast('Не удалось открыть чат');
      return;
    }
    router.push(`/messages/${id}`);
  };

  return (
    <button
      type="button"
      className="btn btn--outline btn--md"
      onClick={() => {
        if (isSessionValid()) open();
        else queueAuthAction(open);
      }}
    >
      ✉️ Написать {targetName}
    </button>
  );
}
