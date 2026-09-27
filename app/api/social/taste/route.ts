import { NextResponse } from 'next/server';
import { loadTitles } from '@/lib/catalog';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';

/** Сравнение вкусов (ТЗ блок 23): для списка uid возвращает жанровые векторы и
    множество тайтлов из profile_history (service key, только явный список). */
export async function POST(request: Request) {
  if (!SUPA_URL || !SERVICE) return NextResponse.json({ rows: [] }, { status: 409 });
  const { uids, mySlugs } = (await request.json().catch(() => ({}))) as { uids?: string[]; mySlugs?: string[] };
  if (!uids?.length) return NextResponse.json({ rows: [] });
  const inList = `(${uids.slice(0, 100).map((id) => encodeURIComponent(`"${id}"`)).join(',')})`;
  const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const [histRes, profRes] = await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/profile_history?user_id=in.${inList}&select=user_id,slug`, { headers: H }),
    fetch(`${SUPA_URL}/rest/v1/profiles?user_id=in.${inList}&select=user_id,username`, { headers: H }),
  ]);
  const hist = histRes.ok ? ((await histRes.json()) as Array<{ user_id: string; slug: string }>) : [];
  const profs = profRes.ok ? ((await profRes.json()) as Array<{ user_id: string; username: string | null }>) : [];
  const titles = loadTitles();
  const genresBySlug = new Map(titles.map((t) => [t.slug, t.genres]));
  const byUser = new Map<string, { slugs: Set<string>; genres: Map<string, number> }>();
  for (const h of hist) {
    if (!byUser.has(h.user_id)) byUser.set(h.user_id, { slugs: new Set(), genres: new Map() });
    const u = byUser.get(h.user_id)!;
    u.slugs.add(h.slug);
    for (const g of genresBySlug.get(h.slug) ?? []) u.genres.set(g, (u.genres.get(g) ?? 0) + 1);
  }
  const mine = new Set(mySlugs ?? []);
  const rows = [...byUser.entries()].map(([uid, v]) => {
    let inter = 0;
    for (const s of v.slugs) if (mine.has(s)) inter++;
    const union = new Set([...v.slugs, ...mine]).size || 1;
    return {
      uid,
      username: profs.find((p) => p.user_id === uid)?.username ?? 'аноним',
      shared: inter,
      jaccard: Math.round((100 * inter) / union),
      genres: Object.fromEntries(v.genres),
    };
  });
  return NextResponse.json({ rows });
}
