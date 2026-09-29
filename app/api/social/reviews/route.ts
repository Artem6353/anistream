import { NextResponse } from 'next/server';
import { rateLimit, supabaseConfigured, verifyCaptcha } from '@/lib/social-server';
import { log } from '@/lib/logger';
import { getUserId, getOrCreateUserId } from '@/lib/userId';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPA_SERVICE =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

type ReviewItem = Record<string, unknown> & { id: string };

// Подтягиваем реакции текущего пользователя (если cookie есть)
async function attachMyReactions(items: ReviewItem[]) {
  const userId = await getUserId();
  if (!userId || !items.length) return;
  const ids = items.map((i) => i.id).filter(Boolean);
  const reactionsRes = await fetch(
    `${SUPA_URL}/rest/v1/review_reactions?user_id=eq.${encodeURIComponent(userId)}&review_id=in.(${ids
      .map((id) => encodeURIComponent(id))
      .join(',')})&select=review_id,kind`,
    { headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } },
  );
  if (reactionsRes.ok) {
    const reactions = (await reactionsRes.json()) as Array<{ review_id: string; kind: string }>;
    const map = new Map(reactions.map((x) => [x.review_id, x.kind]));
    for (const item of items) {
      item.myReaction = map.get(item.id) ?? null;
    }
  }
}

// ТЗ блок 17: авторы отзывов — профиль (аватар, имя, бейджи) + число серий из
// profile_history (service_key) для статуса уровня.
async function attachAuthors(items: ReviewItem[]) {
  const SERVICE = process.env.SUPABASE_SERVICE_KEY;
  const ids = [...new Set(items.map((i) => String(i.user_id ?? '')).filter(Boolean))];
  if (!ids.length || !SUPA_URL) return;
  const key = SERVICE || SUPA_ANON;
  const inList = `(${ids.map((id) => encodeURIComponent(`"${id}"`)).join(',')})`;
  const [profRes, histRes] = await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/profiles?user_id=in.${inList}&select=user_id,username,avatar_url,pinned_achievements`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }),
    SERVICE
      ? fetch(`${SUPA_URL}/rest/v1/profile_history?user_id=in.${inList}&select=user_id&limit=2000`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        })
      : Promise.resolve(null),
  ]);
  const profiles = profRes.ok ? ((await profRes.json()) as Array<{ user_id: string; username: string | null; avatar_url: string | null; pinned_achievements: string[] | null }>) : [];
  const pmap = new Map(profiles.map((p) => [p.user_id, p]));
  let counts = new Map<string, number>();
  if (histRes && histRes.ok) {
    const rows = (await histRes.json()) as Array<{ user_id: string }>;
    for (const row of rows) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  for (const item of items) {
    const p = pmap.get(String(item.user_id ?? ''));
    if (p) item.author = { user_id: p.user_id, username: p.username, avatar_url: p.avatar_url, pinned: p.pinned_achievements, episodes: counts.get(p.user_id) ?? 0 };
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get('slug') ?? '';
  const limitParam = params.get('limit');
  if (!supabaseConfigured()) return NextResponse.json({ mode: 'local', items: [] });

  // Ветка для виджета «свежие отзывы» на главной: последние N отзывов по всему каталогу
  if (limitParam) {
    const limit = Math.max(1, Math.min(20, Number.parseInt(limitParam, 10) || 5));
    const r = await fetch(
      `${SUPA_URL}/rest/v1/reviews?order=ts.desc&limit=${limit}`,
      { headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } },
    );
    if (!r.ok) return NextResponse.json({ mode: 'supabase', items: [] }, { status: 502 });
    const items = (await r.json()) as ReviewItem[];
    await attachMyReactions(items);
    return NextResponse.json({ mode: 'supabase', items });
  }

  // Ветка «Сейчас обсуждают» (ТЗ 18.5): отзывы за 24 ч с ≥1 комментарием
  if (params.get('discussed')) {
    const since = Date.now() - 24 * 3600_000;
    const rr = await fetch(`${SUPA_URL}/rest/v1/reviews?ts=gte.${since}&order=ts.desc&limit=200`, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` },
    });
    if (!rr.ok) return NextResponse.json({ mode: 'supabase', items: [] }, { status: 502 });
    const all = (await rr.json()) as ReviewItem[];
    const roots = all.filter((i) => !i.parent && (i as { rating?: number | null }).rating !== null);
    const commentCount = new Map<string, number>();
    for (const i of all) {
      const pid = typeof i.parent === 'string' ? i.parent : null;
      if (pid) commentCount.set(pid, (commentCount.get(pid) ?? 0) + 1);
    }
    const items = roots
      .filter((i) => (commentCount.get(i.id) ?? 0) >= 1)
      .sort((a, b) => (commentCount.get(b.id) ?? 0) - (commentCount.get(a.id) ?? 0))
      .slice(0, 10)
      .map((i) => ({ ...i, comments: commentCount.get(i.id) ?? 0 }));
    return NextResponse.json({ mode: 'supabase', items });
  }

  const r = await fetch(
    `${SUPA_URL}/rest/v1/reviews?slug=eq.${encodeURIComponent(slug)}&order=ts.desc&limit=200`,
    { headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } },
  );
  if (!r.ok) return NextResponse.json({ mode: 'supabase', items: [] }, { status: 502 });

  const items = (await r.json()) as ReviewItem[];
  await attachMyReactions(items);
  await attachAuthors(items);

  return NextResponse.json({ mode: 'supabase', items });
}

export async function POST(request: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ error: 'общий режим выключен: используйте локальные отзывы' }, { status: 409 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
  if (!rateLimit(ip)) return NextResponse.json({ error: 'слишком часто, подождите минуту' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as {
    slug?: string;
    name?: string;
    rating?: number | null;
    text?: string;
    parent?: string | null;
    captcha?: { token?: string; answer?: number };
    turnstile?: string;
    uid?: string | null;
  };
  const turnstileSecret = process.env.TURNSTILE_SECRET;
  if (turnstileSecret) {
    const cf = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: turnstileSecret, response: body.turnstile }),
    });
    const cj = (await cf.json()) as { success?: boolean };
    if (!cj.success) return NextResponse.json({ error: 'капча не пройдена' }, { status: 403 });
  } else if (!verifyCaptcha(body.captcha?.token, body.captcha?.answer)) {
    return NextResponse.json({ error: 'капча неверна или устарела' }, { status: 400 });
  }
  const text = String(body.text ?? '').trim().slice(0, 2000);
  if (!body.slug || !text) return NextResponse.json({ error: 'пустой текст' }, { status: 400 });
  const item = {
    id: crypto.randomUUID(),
    slug: body.slug,
    name: String(body.name ?? 'Гость').slice(0, 40),
    rating: body.rating ?? null,
    text,
    ts: Date.now(),
    likes: 0,
    dislikes: 0,
    parent: body.parent ?? null,
    /* Фича 29.09: у каждого отзыва есть владелец — auth uid залогиненного
      (body.uid) или device-uid из cookie ani_uid у анонима (getOrCreateUserId):
      без этого публичные профили локальных авторов невозможны (/reviewer/[uid]). */
    user_id:
      typeof body.uid === 'string' && body.uid
        ? body.uid
        : await getOrCreateUserId().catch(() => null),
  };
  const r = await fetch(`${SUPA_URL}/rest/v1/reviews`, {
    method: 'POST',
    // RLS: insert в reviews разрешён ТОЛЬКО service_role (аудит, блок 5) —
    // анонимный ключ получал 403 и отзыв не сохранялся.
    headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(item),
  });
  if (!r.ok) {
    log('error', 'reviews insert failed', { status: r.status, body: await r.text() });
    return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  }
  return NextResponse.json({ item: (await r.json())[0] ?? item });
}
