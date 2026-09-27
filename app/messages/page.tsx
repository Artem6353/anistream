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
      // Аудит P1-4: два батч-запроса на весь список тредов (было 2 запроса НА ТРЕД)
      const q = (arr: string[]) => `(${arr.map((x) => encodeURIComponent(`"${x}"`)).join(',')})`;
      const others = [...new Set(list.map((t) => (t.user_a === me ? t.user_b : t.user_a)))];
      const [mr, ur] = await Promise.all([
        supaRest('GET', `dm_messages?thread_id=in.${q(list.map((t) => t.id))}&select=thread_id,text,ts,sender_id,read_at&order=ts.desc&limit=1000`),
        supaRest('GET', `profiles?user_id=in.${q(others)}&select=user_id,username`),
      ]);
      const msgs = mr?.ok ? ((await mr.json()) as Array<{ thread_id: string; text: string; ts: string; sender_id: string; read_at: string | null }>) : [];
      const unames = ur?.ok ? ((await ur.json()) as Array<{ user_id: string; username: string | null }>) : [];
      const nameByUid = new Map(unames.map((u) => [u.user_id, u.username]));
      const byThread = new Map<string, typeof msgs>();
      for (const m of msgs) {
        if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, []);
        byThread.get(m.thread_id)!.push(m); // order=ts.desc → [0] = последнее
      }
      const enriched = list.map((t) => {
        const tm = byThread.get(t.id) ?? [];
        const other = t.user_a === me ? t.user_b : t.user_a;
        return {
          ...t,
          other: nameByUid.get(other) ?? 'аноним',
          last: tm[0] ? { text: tm[0].text, ts: tm[0].ts, sender_id: tm[0].sender_id } : undefined,
          unread: tm.filter((m) => m.sender_id !== me && !m.read_at).length,
        };
      });
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
