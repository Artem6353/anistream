'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isSessionValid, supaRest, supaWhoami } from '@/lib/sync';
import { useToast } from '@/components/ui/Toaster';

interface Club {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  owner_id: string;
  members?: number;
}

/** Клубы по интересам (ТЗ 20.2): список, поиск, создание, вступление. */
export default function ClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [membersOf, setMembersOf] = useState<Record<string, string[]>>({});
  const [myUid, setMyUid] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const toast = useToast();

  const load = async () => {
    const r = await supaRest('GET', 'clubs?select=id,slug,name,description,owner_id&order=created_at.desc&limit=100').catch(() => null);
    const list = r?.ok ? ((await r.json()) as Club[]) : [];
    const mres = await supaRest('GET', 'club_members?select=club_id,user_id').catch(() => null);
    const members = mres?.ok ? ((await mres.json()) as Array<{ club_id: string; user_id: string }>) : [];
    const byClub: Record<string, string[]> = {};
    for (const m of members) (byClub[m.club_id] ??= []).push(m.user_id);
    setMembersOf(byClub);
    setClubs(list.map((c) => ({ ...c, members: (byClub[c.id] ?? []).length })));
  };

  useEffect(() => {
    /* load() — async: все setState внутри происходят ПОСЛЕ await (не синхронно
       в эффекте); правило флагует вызов консервативно. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (isSessionValid()) supaWhoami().then(setMyUid).catch(() => {});
  }, []);

  const create = async () => {
    if (!myUid || !name.trim()) return;
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/gi, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || `club-${Date.now()}`;
    const r = await supaRest('POST', 'clubs', { slug: `${slug}-${Date.now().toString(36).slice(-4)}`, name: name.trim(), description: desc.trim() || null, owner_id: myUid });
    if (!r?.ok) {
      toast('Не удалось создать клуб');
      return;
    }
    await supaRest('POST', 'club_members', { club_id: ((await r.json()) as Array<{ id: string }>)[0]?.id, user_id: myUid, role: 'owner' }).catch(() => {});
    setName('');
    setDesc('');
    toast('Клуб создан');
    load();
  };

  const toggle = async (club: Club) => {
    if (!myUid) {
      toast('Сначала войдите');
      return;
    }
    const joined = (membersOf[club.id] ?? []).includes(myUid);
    if (joined) await supaRest('DELETE', `club_members?club_id=eq.${club.id}&user_id=eq.${myUid}`);
    else await supaRest('POST', 'club_members', { club_id: club.id, user_id: myUid });
    load();
  };

  const shown = clubs.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="container clubs">
      <h1>Клубы</h1>
      <input className="input" placeholder="Поиск клуба…" value={q} onChange={(e) => setQ(e.target.value)} />
      {myUid ? (
        <div className="clubs__create">
          <input className="input" placeholder="Название клуба" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <input className="input" placeholder="Описание" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={140} />
          <button type="button" className="btn btn--primary btn--md" onClick={create}>
            Создать клуб
          </button>
        </div>
      ) : (
        <p className="stats__empty">Войдите, чтобы создавать клубы и вступать в них.</p>
      )}
      <div className="clubs__list">
        {shown.map((c) => {
          const joined = myUid ? (membersOf[c.id] ?? []).includes(myUid) : false;
          return (
            <div className="clubs__card" key={c.id}>
              <Link className="clubs__name" href={`/clubs/${c.slug}`}>
                {c.name}
              </Link>
              <p>{c.description ?? ''}</p>
              <span className="clubs__meta">
                {c.members ?? 0} участников · <Link href={`/clubs/${c.slug}`}>обсуждения</Link>
              </span>
              <button type="button" className={`btn btn--md ${joined ? 'btn--outline' : 'btn--primary'}`} onClick={() => toggle(c)}>
                {joined ? 'Выйти' : 'Вступить'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
