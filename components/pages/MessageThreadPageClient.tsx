'use client';

import { useEffect, useRef, useState } from 'react';
import { use } from 'react';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';

interface Msg {
  id: string;
  sender_id: string;
  text: string;
  ts: string;
}

/** Чат треда (ТЗ 20.3): поллинг 5 сек, отметка прочитанного при открытии. */
export default function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [other, setOther] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  const load = async (myUid: string) => {
    try {
      const r = await supaRest('GET', `dm_messages?thread_id=eq.${id}&select=id,sender_id,text,ts&order=ts.asc&limit=200`);
      const list = r?.ok ? ((await r.json()) as Msg[]) : [];
      setMsgs(list);
      await supaRest('PATCH', `dm_messages?thread_id=eq.${id}&sender_id=neq.${myUid}&read_at=is.null`, { read_at: new Date().toISOString() }).catch(() => {});
      const tr = await supaRest('GET', `dm_threads?id=eq.${id}&select=user_a,user_b`);
      const t = tr?.ok ? ((await tr.json()) as Array<{ user_a: string; user_b: string }>)[0] : null;
      if (t) {
        const oid = t.user_a === myUid ? t.user_b : t.user_a;
        const pr = await supaRest('GET', `profiles?user_id=eq.${oid}&select=username`);
        setOther(((await pr?.json()) as Array<{ username: string | null }>)?.[0]?.username ?? 'аноним');
      }
      requestAnimationFrame(() => boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }));
    } catch {
      /* Сеть/RLS/истёкшая сессия: поллинг не должен валить страницу (раньше
         rejection из setInterval уходил в unhandled). */
    }
  };

  /* Аудит (P1-6): cleanup возвращался ВНУТРИ `.then()` — эффект его игнорировал,
     поэтому интервал не очищался никогда: после ухода со страницы поллинг
     продолжался, а при переходах между тредами копился по таймеру на каждый id
     (старые продолжали тянуть ПРЕДЫДУЩИЙ тред). Теперь cleanup — в теле эффекта,
     плюс cancelled-флаг, чтобы запоздавший supaWhoami не запустил таймер. */
  useEffect(() => {
    if (!isSessionValid()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    supaWhoami()
      .then((uid) => {
        if (!uid || cancelled) return;
        setMe(uid);
        void load(uid);
        timer = setInterval(() => void load(uid), 5000);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const send = async () => {
    if (!me || !text.trim()) return;
    const r = await supaRest('POST', 'dm_messages', { thread_id: id, sender_id: me, text: text.trim() });
    if (r?.ok) {
      await supaRest('PATCH', `dm_threads?id=eq.${id}`, { updated_at: new Date().toISOString() }).catch(() => {});
      setText('');
      void load(me);
    }
  };

  return (
    <div className="container dm">
      <h1>Чат с {other || '…'}</h1>
      <div className="dm__box" ref={boxRef}>
        {msgs.map((m) => (
          <div className={`dm__msg ${m.sender_id === me ? 'is-mine' : ''}`} key={m.id}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="dm__composer">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Сообщение…" maxLength={2000} />
        <button type="button" className="btn btn--primary btn--md" onClick={send}>
          Отправить
        </button>
      </div>
    </div>
  );
}
