'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { use } from 'react';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';
import { timeAgo } from '@/lib/format';

interface Post {
  id: string;
  author_id: string;
  text: string;
  ts: string;
}

/** Сообщения треда форума (ТЗ 20.5). */
export default function ThreadPage({ params }: { params: Promise<{ category: string; thread: string }> }) {
  const { category, thread } = use(params);
  const [title, setTitle] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    if (isSessionValid()) supaWhoami().then(setMe).catch(() => {});
  }, []);

  const load = async () => {
    const [tr, pr] = await Promise.all([
      supaRest('GET', `forum_threads?id=eq.${encodeURIComponent(thread)}&select=title,category_id&limit=1`).catch(() => null),
      supaRest('GET', `forum_posts?thread_id=eq.${encodeURIComponent(thread)}&select=id,author_id,text,ts&order=ts.asc&limit=300`).catch(() => null),
    ]);
    const t = tr?.ok ? ((await tr.json()) as Array<{ title: string }>)[0] : null;
    setTitle(t?.title ?? 'Тред');
    const list = pr?.ok ? ((await pr.json()) as Post[]) : [];
    setPosts(list);
    const uids = [...new Set(list.map((p) => p.author_id))];
    if (uids.length) {
      const nr = await supaRest('GET', `profiles?user_id=in.(${uids.map((u) => encodeURIComponent(`"${u}"`)).join(',')})&select=user_id,username`).catch(() => null);
      const nlist = nr?.ok ? ((await nr.json()) as Array<{ user_id: string; username: string | null }>) : [];
      setNames(Object.fromEntries(nlist.map((n) => [n.user_id, n.username ?? 'аноним'])));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread]);

  const send = async () => {
    if (!me || !text.trim()) return;
    const r = await supaRest('POST', 'forum_posts', { thread_id: thread, author_id: me, text: text.trim() });
    if (r?.ok) {
      setText('');
      load();
    }
  };

  return (
    <div className="container forum">
      <nav className="breadcrumbs">
        <Link href="/forum">Форум</Link> / <Link href={`/forum/${category}`}>раздел</Link> / <span>тред</span>
      </nav>
      <h1>{title}</h1>
      <ul className="feed__list">
        {posts.map((p) => (
          <li className="feed__item" key={p.id}>
            <span className="feed__text">
              {/* баг 29.09: ник → профиль автора */}
              {names[p.author_id] && names[p.author_id] !== 'аноним' ? (
                <Link href={`/profile/${encodeURIComponent(names[p.author_id])}`}>
                  <strong>{names[p.author_id]}</strong>
                </Link>
              ) : (
                <strong>{names[p.author_id] ?? 'аноним'}</strong>
              )}
              : {p.text}
              <small> · {timeAgo(Date.parse(p.ts))}</small>
            </span>
          </li>
        ))}
      </ul>
      {me ? (
        <div className="club__composer">
          <textarea className="input" rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ответ…" />
          <button type="button" className="btn btn--primary btn--md" onClick={send}>
            Ответить
          </button>
        </div>
      ) : (
        <p className="stats__empty">Войдите, чтобы отвечать.</p>
      )}
    </div>
  );
}
