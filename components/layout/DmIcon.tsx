'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';

/** ✉️ в шапке со счётчиком непрочитанных ЛС (ТЗ 20.3), опрос раз в 60 сек. */
export function DmIcon() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!isSessionValid()) return;
      const me = await supaWhoami().catch(() => null);
      if (!me || !alive) return;
      const r = await supaRest('GET', `dm_threads?or=(user_a.eq.${me},user_b.eq.${me})&select=id`).catch(() => null);
      const threads = r?.ok ? ((await r.json()) as Array<{ id: string }>) : [];
      if (!threads.length) {
        if (alive) setUnread(0);
        return;
      }
      const ids = threads.map((t) => t.id);
      const mr = await supaRest('GET', `dm_messages?thread_id=in.(${ids.map((i) => encodeURIComponent(`"${i}"`)).join(',')})&sender_id=neq.${me}&read_at=is.null&select=id`).catch(() => null);
      if (alive) setUnread(mr?.ok ? ((await mr.json()) as unknown[]).length : 0);
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!isSessionValid()) return null;
  return (
    <Link className="icon-btn header__icon" href="/messages" aria-label={`Сообщения${unread ? ` (${unread})` : ''}`} title="Сообщения">
      ✉️
      {unread > 0 ? <span className="header__count">{unread > 9 ? '9+' : unread}</span> : null}
    </Link>
  );
}
