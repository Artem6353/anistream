'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';
import { timeAgo } from '@/lib/format';
import { useToast } from '@/components/ui/Toaster';

interface Post {
  id: string;
  author_id: string;
  text: string;
  ts: string;
}

/** Страница клуба: обсуждения + участники (ТЗ 20.2). */
export default function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [club, setClub] = useState<{ id: string; name: string; description: string | null } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [memberNames, setMemberNames] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [myUid, setMyUid] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (isSessionValid()) supaWhoami().then(setMyUid).catch(() => {});
  }, []);

  const load = async () => {
    const cr = await supaRest('GET', `clubs?slug=eq.${encodeURIComponent(slug)}&select=id,name,description&limit=1`).catch(() => null);
    const c = cr?.ok ? ((await cr.json()) as Array<{ id: string; name: string; description: string | null }>)[0] : null;
    if (!c) return;
    setClub(c);
    const [pr, mr] = await Promise.all([
      supaRest('GET', `club_posts?club_id=eq.${c.id}&select=id,author_id,text,ts&order=ts.desc&limit=100`).catch(() => null),
      supaRest('GET', `club_members?club_id=eq.${c.id}&select=user_id`).catch(() => null),
    ]);
    const plist = pr?.ok ? ((await pr.json()) as Post[]) : [];
    const mlist = mr?.ok ? ((await mr.json()) as Array<{ user_id: string }>) : [];
    setPosts(plist);
    const uids = [...new Set([...plist.map((p) => p.author_id), ...mlist.map((m) => m.user_id)])];
    if (uids.length) {
      const nr = await supaRest('GET', `profiles?user_id=in.(${uids.map((u) => encodeURIComponent(`"${u}"`)).join(',')})&select=user_id,username`).catch(() => null);
      const nlist = nr?.ok ? ((await nr.json()) as Array<{ user_id: string; username: string | null }>) : [];
      setNames(Object.fromEntries(nlist.map((n) => [n.user_id, n.username ?? 'аноним'])));
      setMemberNames(mlist.map((m) => nlist.find((n) => n.user_id === m.user_id)?.username ?? 'аноним'));
    } else {
      setMemberNames([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const send = async () => {
    if (!myUid || !club || !text.trim()) return;
    const r = await supaRest('POST', 'club_posts', { club_id: club.id, author_id: myUid, text: text.trim() });
    if (!r?.ok) {
      toast('Не удалось отправить');
      return;
    }
    setText('');
    load();
  };

  if (!club) return <div className="container empty-state"><h2>Клуб не найден</h2></div>;

  return (
    <div className="container club">
      <h1>{club.name}</h1>
      <p className="stats__empty">{club.description ?? ''}</p>
      <section>
        <h2>Участники ({memberNames.length})</h2>
        <p className="club__members">{memberNames.join(', ') || 'пока никого'}</p>
      </section>
      <section>
        <h2>Обсуждения</h2>
        {myUid ? (
          <div className="club__composer">
            <textarea className="input" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Написать в клуб…" />
            <button type="button" className="btn btn--primary btn--md" onClick={send}>
              Отправить
            </button>
          </div>
        ) : (
          <p className="stats__empty">Войдите, чтобы писать в клуб.</p>
        )}
        <ul className="feed__list">
          {posts.map((p) => (
            <li className="feed__item" key={p.id}>
              <span className="feed__text">
                <strong>{names[p.author_id] ?? 'аноним'}</strong>: {p.text}
                <small> · {timeAgo(Date.parse(p.ts))}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
