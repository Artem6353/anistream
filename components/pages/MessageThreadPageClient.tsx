'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';
import { timeAgo } from '@/lib/format';

interface Msg {
  id: string;
  sender_id: string;
  text: string;
  ts: string;
}

type ThreadState = 'loading' | 'anon' | 'ok' | 'denied' | 'error';

/** Чат треда (ТЗ 20.3): поллинг 5 сек, отметка прочитанного при открытии.
 *  B2-D: preview сначала проверяет участие в треде (RLS), поэтому чужой id
 *  даёт «недоступен», а не пустой чат с композером. */
export default function ThreadPage({ params, preview = false }: { params: Promise<{ id: string }>; preview?: boolean }) {
  const { id } = use(params);
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [other, setOther] = useState('');
  const [state, setState] = useState<ThreadState>('loading');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = async (myUid: string) => {
    try {
      const tr = await supaRest('GET', `dm_threads?id=eq.${id}&select=user_a,user_b`);
      if (!tr?.ok) throw new Error(`Не удалось открыть диалог (HTTP ${tr?.status ?? 'нет сети'})`);
      const t = ((await tr.json()) as Array<{ user_a: string; user_b: string }>)[0];
      if (!t) {
        if (preview) {
          setMsgs([]);
          setOther('');
          setState('denied');
          return;
        }
      } else {
        const oid = t.user_a === myUid ? t.user_b : t.user_a;
        const pr = await supaRest('GET', `profiles?user_id=eq.${oid}&select=username`);
        if (preview && !pr?.ok) throw new Error('Не удалось загрузить профиль собеседника');
        if (pr?.ok) setOther(((await pr.json()) as Array<{ username: string | null }>)?.[0]?.username ?? 'аноним');
      }

      const r = await supaRest('GET', `dm_messages?thread_id=eq.${id}&select=id,sender_id,text,ts&order=ts.asc&limit=200`);
      if (!r?.ok) throw new Error(`Не удалось загрузить сообщения (HTTP ${r?.status ?? 'нет сети'})`);
      const list = (await r.json()) as Msg[];
      setMsgs(list);
      await supaRest('PATCH', `dm_messages?thread_id=eq.${id}&sender_id=neq.${myUid}&read_at=is.null`, { read_at: new Date().toISOString() }).catch(() => {});
      setState('ok');
      requestAnimationFrame(() => boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }));
    } catch (e) {
      if (preview) {
        setError(e instanceof Error ? e.message : 'Не удалось открыть диалог');
        setState('error');
      }
      /* Production сохраняет прежнее поведение: сеть/RLS не валят страницу. */
    }
  };

  useEffect(() => {
    if (!isSessionValid()) {
      queueMicrotask(() => {
        if (preview) router.replace(`/preview/aninova-3/auth?reason=protected&next=${encodeURIComponent(`/preview/aninova-3/messages/${id}`)}`);
        else setState('anon');
      });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    supaWhoami()
      .then((uid) => {
        if (!uid || cancelled) return;
        setMe(uid);
        void load(uid);
        timer = setInterval(() => void load(uid), 5000);
      })
      .catch(() => {
        if (cancelled) return;
        if (preview) {
          setError('Сессия истекла — войдите заново');
          setState('error');
        }
      });
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, preview, router, attempt]);

  const send = async () => {
    const value = text.trim();
    if (!me || !value || sending) return;
    setSending(true);
    setSendError('');
    try {
      const r = await supaRest('POST', 'dm_messages', { thread_id: id, sender_id: me, text: value });
      if (!r?.ok) throw new Error(`Сообщение не отправлено (HTTP ${r?.status ?? 'нет сети'})`);
      await supaRest('PATCH', `dm_threads?id=eq.${id}`, { updated_at: new Date().toISOString() }).catch(() => {});
      setText('');
      await load(me);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  };

  if (preview) {
    return (
      <div className="a3-wrap a3-dm">
        <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
          <Link href="/preview/aninova-3">Главная</Link>
          <span aria-hidden="true">/</span>
          <Link href="/preview/aninova-3/messages">Сообщения</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{other || 'Диалог'}</span>
        </nav>

        {state === 'loading' ? <p className="a3-muted" role="status">Открываем диалог…</p> : null}
        {state === 'denied' ? (
          <div className="a3-empty" role="alert">
            <h1 className="a3-empty__title">Диалог недоступен</h1>
            <p className="a3-muted">Этот диалог не существует или вы не являетесь его участником.</p>
            <Link className="a3-link" href="/preview/aninova-3/messages">← К списку сообщений</Link>
          </div>
        ) : null}
        {state === 'error' ? (
          <div className="a3-empty" role="alert">
            <h1 className="a3-empty__title">Не удалось открыть диалог</h1>
            <p className="a3-muted">{error}</p>
            <button className="a3-btn" type="button" onClick={() => { setState('loading'); setError(''); setAttempt((n) => n + 1); }}>Повторить</button>
          </div>
        ) : null}

        {state === 'ok' ? (
          <section className="a3-dm__thread" aria-labelledby="dm-title">
            <header className="a3-dm__head">
              <Link className="a3-dm__back" href="/preview/aninova-3/messages">← Все диалоги</Link>
              <h1 className="a3-h1" id="dm-title">Чат с {other || 'участником'}</h1>
              <p className="a3-muted">Сообщения видны только участникам диалога. Обновление каждые 5 секунд.</p>
            </header>
            <div className="a3-dm__box" ref={boxRef} role="log" aria-live="polite" aria-label={`Сообщения в диалоге с ${other || 'участником'}`}>
              {!msgs.length ? <p className="a3-muted a3-dm__empty">Сообщений пока нет. Напишите первым.</p> : null}
              {msgs.map((m) => (
                <div className={`a3-dm__msg${m.sender_id === me ? ' is-mine' : ''}`} key={m.id}>
                  <p>{m.text}</p>
                  <time dateTime={m.ts}>{timeAgo(Date.parse(m.ts))}</time>
                </div>
              ))}
            </div>
            <form className="a3-dm__composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <label className="a3-sr" htmlFor="dm-message-text">Текст сообщения</label>
              <input
                id="dm-message-text"
                className="a3-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Сообщение…"
                maxLength={2000}
                autoComplete="off"
              />
              <button className="a3-btn a3-btn--primary" type="submit" disabled={sending || !text.trim()}>
                {sending ? 'Отправка…' : 'Отправить'}
              </button>
            </form>
            {sendError ? <p className="a3-error" role="alert">{sendError}</p> : null}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="container dm">
      <h1>Чат с {other || '…'}</h1>
      {state === 'anon' ? <div className="empty-state"><h2>Нужен вход</h2><p>Личные сообщения доступны после входа.</p></div> : null}
      <div className="dm__box" ref={boxRef}>
        {msgs.map((m) => (
          <div className={`dm__msg ${m.sender_id === me ? 'is-mine' : ''}`} key={m.id}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="dm__composer">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Сообщение…" maxLength={2000} />
        <button type="button" className="btn btn--primary btn--md" onClick={send} disabled={sending}>
          {sending ? '…' : 'Отправить'}
        </button>
      </div>
      {sendError ? <p className="panel__note" role="alert">{sendError}</p> : null}
    </div>
  );
}
