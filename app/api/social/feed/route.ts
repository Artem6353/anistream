import { NextResponse } from 'next/server';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';

/** Лента активности подписок (ТЗ 20.1): просмотры (profile_history) + отзывы.
    Чтение чужой истории — service_key и только для явного списка uid'ов,
    которого клиент получает из своих подписок (follows). */
export async function POST(request: Request) {
  if (!SUPA_URL || !SERVICE) return NextResponse.json({ items: [] }, { status: 409 });
  const { uids } = (await request.json().catch(() => ({}))) as { uids?: string[] };
  if (!uids?.length) return NextResponse.json({ items: [] });
  const inList = `(${uids.slice(0, 200).map((id) => encodeURIComponent(`"${id}"`)).join(',')})`;
  const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const [histRes, revRes, profRes] = await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/profile_history?user_id=in.${inList}&select=user_id,slug,episode,updated_at&order=updated_at.desc&limit=200`, { headers: H }),
    fetch(`${SUPA_URL}/rest/v1/reviews?user_id=in.${inList}&select=user_id,slug,name,text,ts&order=ts.desc&limit=100`, { headers: H }),
    fetch(`${SUPA_URL}/rest/v1/profiles?user_id=in.${inList}&select=user_id,username,avatar_url`, { headers: H }),
  ]);
  const hist = histRes.ok ? ((await histRes.json()) as Array<{ user_id: string; slug: string; episode: number; updated_at: string }>) : [];
  const revs = revRes.ok ? ((await revRes.json()) as Array<{ user_id: string; slug: string; name: string; text: string; ts: number }>) : [];
  const profs = profRes.ok ? ((await profRes.json()) as Array<{ user_id: string; username: string | null; avatar_url: string | null }>) : [];
  const pmap = new Map(profs.map((p) => [p.user_id, p]));
  type FeedItem = { type: 'watch' | 'review'; ts: number; user: string; avatar: string | null; slug: string; episode?: number; text?: string };
  const items: FeedItem[] = [
    ...hist.map((h) => ({
      type: 'watch' as const,
      ts: Date.parse(h.updated_at),
      user: pmap.get(h.user_id)?.username ?? 'аноним',
      avatar: pmap.get(h.user_id)?.avatar_url ?? null,
      slug: h.slug,
      episode: h.episode,
    })),
    ...revs.map((r) => ({
      type: 'review' as const,
      ts: r.ts,
      user: pmap.get(r.user_id)?.username ?? r.name,
      avatar: pmap.get(r.user_id)?.avatar_url ?? null,
      slug: r.slug,
      text: r.text.slice(0, 120),
    })),
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 60);
  return NextResponse.json({ items });
}
