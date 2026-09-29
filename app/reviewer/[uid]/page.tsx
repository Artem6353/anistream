import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadTitles } from '@/lib/catalog';

/** Фича 29.09: публичный профиль активности ЛОКАЛЬНОГО (незарегистрированного)
    автора отзывов: отзывы/комментарии хранятся на сервере с user_id = device-uid
    (cookie ani_uid), страница собирает их по этому id. Зарегистрированные
    пользователи по-прежнему живут на /profile/[username].
    Индексация закрыта (UGC-страницы устройств не должны плодить индекс). */

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

type Row = {
  id: string;
  slug: string;
  name: string;
  rating: number | null;
  text: string;
  ts: number;
  parent: string | null;
};

async function fetchRows(uid: string): Promise<Row[]> {
  if (!SUPA_URL || !SUPA_KEY) return [];
  const r = await fetch(
    `${SUPA_URL}/rest/v1/reviews?user_id=eq.${encodeURIComponent(uid)}&order=ts.desc&limit=300&select=id,slug,name,rating,text,ts,parent`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }, cache: 'no-store' },
  );
  if (!r.ok) return [];
  return (await r.json()) as Row[];
}

export async function generateMetadata({ params }: { params: Promise<{ uid: string }> }): Promise<Metadata> {
  const { uid } = await params;
  const rows = await fetchRows(uid);
  const name = rows[0]?.name || 'Участник';
  return {
    title: `${name} — отзывы и комментарии`,
    robots: { index: false, follow: true },
  };
}

export default async function ReviewerPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const rows = await fetchRows(uid);
  if (!rows.length) notFound();

  const roots = rows.filter((r) => !r.parent && r.rating !== null);
  const comments = rows.length - roots.length;
  const name = rows[0]?.name || 'Участник';
  const avg = roots.length
    ? (roots.reduce((a, r) => a + (r.rating ?? 0), 0) / roots.length).toFixed(1)
    : null;
  const first = rows[rows.length - 1];
  const titles = loadTitles();
  const ru = new Map(titles.map((t) => [t.slug, t.ru]));

  return (
    <div className="container">
      <header className="page-head">
        <h1>{name}</h1>
        <p>Публичный профиль активности участника AniNova: отзывы и комментарии, оставленные с этого устройства.</p>
      </header>

      <div className="reviewer__stats">
        <div className="reviewer__stat">
          <strong>{roots.length}</strong>
          <span>отзывов</span>
        </div>
        <div className="reviewer__stat">
          <strong>{comments}</strong>
          <span>комментариев</span>
        </div>
        {avg ? (
          <div className="reviewer__stat">
            <strong>★ {avg}</strong>
            <span>средняя оценка</span>
          </div>
        ) : null}
        {first ? (
          <div className="reviewer__stat">
            <strong>{new Date(first.ts).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })}</strong>
            <span>на сайте с</span>
          </div>
        ) : null}
      </div>

      <div className="reviewer__list">
        {roots.map((r) => (
          <article className="reviewer__item" key={r.id}>
            <div className="reviewer__item-head">
              <Link href={`/anime/${r.slug}`}>{ru.get(r.slug) ?? r.slug}</Link>
              {r.rating !== null ? <span className="reviewer__score">★ {r.rating}</span> : null}
              <time>{new Date(r.ts).toLocaleDateString('ru-RU')}</time>
            </div>
            <p>{r.text}</p>
          </article>
        ))}
        {roots.length === 0 ? (
          <p className="settings__note">У участника пока только комментарии — они видны в обсуждениях на страницах тайтлов.</p>
        ) : null}
      </div>
    </div>
  );
}
