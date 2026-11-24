'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isFollowing, myUid, setFollow } from '@/lib/social-graph';
import { isSessionValid } from '@/lib/sync';
import { queueAuthAction } from '@/lib/auth-gate';
import { useToast } from '@/components/ui/Toaster';

const PREVIEW_ROOT = '/preview/aninova-3';

/** Кнопка «Подписаться/Отписаться» на чужом профиле (ТЗ блок 20.1).
 *  B2-D: в preview гость уходит на preview-вход с безопасным next на текущий
 *  публичный профиль; после возврата действие не проигрывается само —
 *  человек нажимает кнопку снова. Production-путь не меняется. */
export function FollowButton({ targetId, preview = false }: { targetId: string; preview?: boolean }) {
  const [following, setFollowing] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname() ?? '';

  useEffect(() => {
    (async () => {
      if (!isSessionValid()) {
        setReady(true);
        return;
      }
      const uid = await myUid();
      setMe(uid);
      if (uid && uid !== targetId) setFollowing(await isFollowing(targetId));
      setReady(true);
    })();
  }, [targetId]);

  if (!ready || me === targetId) return null;

  const authHref = () => {
    const next = preview && pathname.startsWith(`${PREVIEW_ROOT}/`) ? pathname : `${PREVIEW_ROOT}/profile`;
    return `${PREVIEW_ROOT}/auth?reason=protected&next=${encodeURIComponent(next)}`;
  };

  const click = () => {
    const act = async () => {
      const uid = me ?? (await myUid());
      if (!uid) {
        if (preview) router.push(authHref());
        return;
      }
      const next = !following;
      const ok = await setFollow(uid, targetId, next);
      if (ok) {
        setFollowing(next);
        toast(next ? 'Вы подписались' : 'Вы отписались');
      } else {
        toast.error('Не удалось изменить подписку');
      }
    };
    if (isSessionValid()) act();
    else if (preview) router.push(authHref());
    else queueAuthAction(act);
  };

  return (
    <button
      type="button"
      className={preview ? `a3-btn ${following ? 'a3-btn--ghost' : 'a3-btn--primary'}` : `btn btn--md ${following ? 'btn--outline' : 'btn--primary'}`}
      aria-pressed={following}
      onClick={click}
    >
      {following ? 'Отписаться' : 'Подписаться'}
    </button>
  );
}
