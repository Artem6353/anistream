'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';
import { timeAgo } from '@/lib/format';

interface Thread {
  id: string;
  user_a: string;
  user_b: string;
  updated_at: string;
  last?: { text: string; ts: string; sender_id: string };
  other?: string;
  unread?: number;
}

/** Список тредов ЛС (ТЗ 20.3). */
export default function MessagesPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [state, setState] = useState<'loading' | 'anon' | 'ok'>('loading');

  useEffect(() => {
    (async () => {
      if (!isSessionValid()) {
        setState('anon');
        return;
      }
      const me = await supaWhoami().catch(() => null);
      if (!me) {
        setState('anon');
        return;
      }
      const r = await supaRest('GET', `dm_threads?or=(user_a.eq.${me},user_b.eq.${me})&select=id,user_a,user_b,updated_at&order=updated_at.desc`);
      const list = r?.ok ? ((await r.json()) as Thread[]) : [];
      const enriched = await Promise.all(
        list.map(async (t) => {
          const other = t.user_a === me ? t.user_b : t.user_a;
          const [mr, ur] = await Promise.all([
            supaRest('GET', `dm_messages?thread_id=eq.${t.id}&select=text,ts,sender_id,read_at&order=ts.desc&limit=50`),
            supaRest('GET', `profiles?user_id=eq.${other}&select=username`),
          ]);
          const msgs = mr?.ok ? ((await mr.json()) as Array<{ text: string; ts: string; sender_id: string; read_at: string | null }>) : [];
          const uname = ur?.ok ? ((await ur.json()) as Array<{ username: string | null }>)[0]?.username : null;
          return {
            ...t,
            other: uname ?? 'аноним',
            last: msgs[0] ? { text: msgs[0].text, ts: msgs[0].ts, sender_id: msgs[0].sender_id } : undefined,
            unread: msgs.filter((m) => m.sender_id !== me && !m.read_at).length,
          };
        }),
      );
      setThreads(enriched);
      setState('ok');
    })();
  }, []);

  return (
    <div className="container messages">
      <h1>Сообщения</h1>
      {state === 'anon' ? <div className="empty-state"><h2>Нужен вход</h2><p>Личные сообщения доступны после входа.</p></div> : null}
      {state === 'ok' && !threads.length ? <p className="stats__empty">Тредов пока нет — напишите кому-нибудь с профиля.</p> : null}
      <ul className="feed__list">
        {threads.map((t) => (
          <li className="feed__item" key={t.id}>
            <span className="feed__text">
              <Link href={`/messages/${t.id}`}>
                <strong>{t.other}</strong>
              </Link>
              {t.last ? <> · {t.last.text.slice(0, 60)} <small>{timeAgo(Date.parse(t.last.ts))}</small></> : <small> · пусто</small>}
              {t.unread ? <span className="dm-unread"> {t.unread}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
