'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { use } from 'react';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';
import { timeAgo } from '@/lib/format';

interface Thread {
  id: string;
  title: string;
  author_id: string;
  created_at: string;
  posts?: number;
}

/** Треды раздела форума (ТЗ 20.5). */
export default function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = use(params);
  const [cat, setCat] = useState<{ id: number; name: string } | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    if (isSessionValid()) supaWhoami().then(setMe).catch(() => {});
  }, []);

  const load = async () => {
    const cr = await supaRest('GET', `forum_categories?slug=eq.${encodeURIComponent(category)}&select=id,name&limit=1`).catch(() => null);
    const c = cr?.ok ? ((await cr.json()) as Array<{ id: number; name: string }>)[0] : null;
    if (!c) return;
    setCat(c);
    const tr = await supaRest('GET', `forum_threads?category_id=eq.${c.id}&select=id,title,author_id,created_at&order=created_at.desc&limit=100`).catch(() => null);
    const list = tr?.ok ? ((await tr.json()) as Thread[]) : [];
    const pr = await supaRest('GET', `forum_posts?select=thread_id`).catch(() => null);
    const posts = pr?.ok ? ((await pr.json()) as Array<{ thread_id: string }>) : [];
    const counts = new Map<string, number>();
    for (const p of posts) counts.set(p.thread_id, (counts.get(p.thread_id) ?? 0) + 1);
    const uids = [...new Set(list.map((t) => t.author_id))];
    if (uids.length) {
      const nr = await supaRest('GET', `profiles?user_id=in.(${uids.map((u) => encodeURIComponent(`"${u}"`)).join(',')})&select=user_id,username`).catch(() => null);
      const nlist = nr?.ok ? ((await nr.json()) as Array<{ user_id: string; username: string | null }>) : [];
      setNames(Object.fromEntries(nlist.map((n) => [n.user_id, n.username ?? 'аноним'])));
    }
    setThreads(list.map((t) => ({ ...t, posts: counts.get(t.id) ?? 0 })));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const create = async () => {
    if (!me || !cat || !title.trim()) return;
    const r = await supaRest('POST', 'forum_threads', { category_id: cat.id, author_id: me, title: title.trim() });
    if (r?.ok) {
      setTitle('');
      load();
    }
  };

  return (
    <div className="container forum">
      <nav className="breadcrumbs">
        <Link href="/forum">Форум</Link> / <span>{cat?.name ?? category}</span>
      </nav>
      <h1>{cat?.name ?? '…'}</h1>
      {me ? (
        <div className="club__composer">
          <input className="input" placeholder="Заголовок нового треда" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          <button type="button" className="btn btn--primary btn--md" onClick={create}>
            Создать тред
          </button>
        </div>
      ) : (
        <p className="stats__empty">Войдите, чтобы создавать треды.</p>
      )}
      <ul className="feed__list">
        {threads.map((t) => (
          <li className="feed__item" key={t.id}>
            <span className="feed__text">
              <Link href={`/forum/${category}/${t.id}`}>
                <strong>{t.title}</strong>
              </Link>{' '}
              ·{' '}
              {names[t.author_id] && names[t.author_id] !== 'аноним' ? (
                <Link href={`/profile/${encodeURIComponent(names[t.author_id])}`}>{names[t.author_id]}</Link>
              ) : (
                (names[t.author_id] ?? 'аноним')
              )}{' '}
              · {t.posts ?? 0} ответов <small>· {timeAgo(Date.parse(t.created_at))}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
