'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

const PREVIEW_MESSAGES = '/preview/aninova-3/messages';

/** Список тредов ЛС (ТЗ 20.3). B2-D: preview использует тот же RLS-поток,
 *  но все ссылки остаются внутри preview и гость уходит на preview-вход. */
export default function MessagesPage({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [state, setState] = useState<'loading' | 'anon' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (!isSessionValid()) {
        if (preview) router.replace(`/preview/aninova-3/auth?reason=protected&next=${encodeURIComponent(PREVIEW_MESSAGES)}`);
        else setState('anon');
        return;
      }
      const me = await supaWhoami().catch(() => null);
      if (cancelled) return;
      if (!me) {
        if (preview) router.replace(`/preview/aninova-3/auth?reason=protected&next=${encodeURIComponent(PREVIEW_MESSAGES)}`);
        else setState('anon');
        return;
      }
      try {
        const r = await supaRest('GET', `dm_threads?or=(user_a.eq.${me},user_b.eq.${me})&select=id,user_a,user_b,updated_at&order=updated_at.desc`);
        if (!r?.ok) throw new Error(`Не удалось загрузить диалоги (HTTP ${r?.status ?? 'нет сети'})`);
        const list = (await r.json()) as Thread[];
        if (!list.length) {
          if (!cancelled) {
            setThreads([]);
            setState('ok');
          }
          return;
        }
        // Аудит P1-4: два батч-запроса на весь список тредов (было 2 запроса НА ТРЕД)
        const q = (arr: string[]) => `(${arr.map((x) => encodeURIComponent(`"${x}"`)).join(',')})`;
        const others = [...new Set(list.map((t) => (t.user_a === me ? t.user_b : t.user_a)))];
        const [mr, ur] = await Promise.all([
          supaRest('GET', `dm_messages?thread_id=in.${q(list.map((t) => t.id))}&select=thread_id,text,ts,sender_id,read_at&order=ts.desc&limit=1000`),
          supaRest('GET', `profiles?user_id=in.${q(others)}&select=user_id,username`),
        ]);
        if (!mr?.ok || !ur?.ok) throw new Error('Не удалось загрузить сообщения или профили');
        const msgs = (await mr.json()) as Array<{ thread_id: string; text: string; ts: string; sender_id: string; read_at: string | null }>;
        const unames = (await ur.json()) as Array<{ user_id: string; username: string | null }>;
        const nameByUid = new Map(unames.map((u) => [u.user_id, u.username]));
        const byThread = new Map<string, typeof msgs>();
        for (const m of msgs) {
          if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, []);
          byThread.get(m.thread_id)!.push(m); // order=ts.desc → [0] = последнее
        }
        if (cancelled) return;
        setThreads(list.map((t) => {
          const tm = byThread.get(t.id) ?? [];
          const other = t.user_a === me ? t.user_b : t.user_a;
          return {
            ...t,
            other: nameByUid.get(other) ?? 'аноним',
            last: tm[0] ? { text: tm[0].text, ts: tm[0].ts, sender_id: tm[0].sender_id } : undefined,
            unread: tm.filter((m) => m.sender_id !== me && !m.read_at).length,
          };
        }));
        setState('ok');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить сообщения');
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [attempt, preview, router]);

  const href = (id: string) => preview ? `${PREVIEW_MESSAGES}/${id}` : `/messages/${id}`;

  if (preview) {
    return (
      <div className="a3-wrap a3-messages">
        <nav className="a3-breadcrumbs" aria-label="Хлебные крошки">
          <Link href="/preview/aninova-3">Главная</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Сообщения</span>
        </nav>
        <header className="a3-pagehead">
          <p className="a3-kicker">Личные диалоги</p>
          <h1 className="a3-h1">Сообщения</h1>
          <p className="a3-pagehead__lead">Диалоги доступны только участникам. Непрочитанные отмечены счётчиком.</p>
        </header>
        {state === 'loading' ? <p className="a3-muted" role="status">Загружаем диалоги…</p> : null}
        {state === 'error' ? (
          <div className="a3-empty" role="alert">
            <h2 className="a3-empty__title">Сообщения недоступны</h2>
            <p className="a3-muted">{error}</p>
            <button className="a3-btn" type="button" onClick={() => { setState('loading'); setError(''); setAttempt((n) => n + 1); }}>Повторить</button>
          </div>
        ) : null}
        {state === 'ok' && !threads.length ? (
          <div className="a3-empty">
            <h2 className="a3-empty__title">Диалогов пока нет</h2>
            <p className="a3-muted">Откройте публичный профиль участника и нажмите «Написать сообщение».</p>
            <Link className="a3-link" href="/preview/aninova-3/catalog">Перейти в каталог →</Link>
          </div>
        ) : null}
        {threads.length ? (
          <ul className="a3-dm-list">
            {threads.map((t) => (
              <li key={t.id}>
                <Link className="a3-dm-list__item" href={href(t.id)}>
                  <span className="a3-dm-list__avatar" aria-hidden="true">{(t.other ?? '?').slice(0, 1).toUpperCase()}</span>
                  <span className="a3-dm-list__body">
                    <span className="a3-dm-list__name">{t.other}</span>
                    <span className="a3-dm-list__preview">{t.last ? t.last.text.slice(0, 80) : 'Сообщений пока нет'}</span>
                  </span>
                  <span className="a3-dm-list__side">
                    {t.last ? <time dateTime={t.last.ts}>{timeAgo(Date.parse(t.last.ts))}</time> : null}
                    {t.unread ? <span className="a3-dm-unread" aria-label={`Непрочитанных: ${t.unread}`}>{t.unread}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="container messages">
      <h1>Сообщения</h1>
      {state === 'anon' ? <div className="empty-state"><h2>Нужен вход</h2><p>Личные сообщения доступны после входа.</p></div> : null}
      {state === 'loading' ? <p className="stats__empty">Загружаем диалоги…</p> : null}
      {state === 'error' ? <div className="empty-state" role="alert"><h2>Не удалось загрузить</h2><p>{error}</p><button className="btn btn--outline btn--md" type="button" onClick={() => { setState('loading'); setError(''); setAttempt((n) => n + 1); }}>Повторить</button></div> : null}
      {state === 'ok' && !threads.length ? <p className="stats__empty">Тредов пока нет — напишите кому-нибудь с профиля.</p> : null}
      <ul className="feed__list">
        {threads.map((t) => (
          <li className="feed__item" key={t.id}>
            <span className="feed__text">
              <Link href={href(t.id)}>
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
