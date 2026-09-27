'use client';

import { useEffect, useState } from 'react';
import { isFollowing, myUid, setFollow } from '@/lib/social-graph';
import { isSessionValid } from '@/lib/sync';
import { queueAuthAction } from '@/lib/auth-gate';
import { useToast } from '@/components/ui/Toaster';

/** Кнопка «Подписаться/Отписаться» на чужом профиле (ТЗ блок 20.1). */
export function FollowButton({ targetId }: { targetId: string }) {
  const [following, setFollowing] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const toast = useToast();

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

  const click = () => {
    const act = async () => {
      const uid = me ?? (await myUid());
      if (!uid) return;
      const next = !following;
      const ok = await setFollow(uid, targetId, next);
      if (ok) {
        setFollowing(next);
        toast(next ? 'Вы подписались' : 'Вы отписались');
      }
    };
    if (isSessionValid()) act();
    else queueAuthAction(act);
  };

  return (
    <button type="button" className={`btn btn--md ${following ? 'btn--outline' : 'btn--primary'}`} onClick={click}>
      {following ? 'Отписаться' : 'Подписаться'}
    </button>
  );
}
