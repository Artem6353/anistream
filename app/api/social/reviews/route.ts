import { NextResponse } from 'next/server';
import { rateLimit, supabaseConfigured, verifyCaptcha } from '@/lib/social-server';
import { getUserId } from '@/lib/userId';

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

  const r = await fetch(
    `${SUPA_URL}/rest/v1/reviews?slug=eq.${encodeURIComponent(slug)}&order=ts.desc&limit=200`,
    { headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } },
  );
  if (!r.ok) return NextResponse.json({ mode: 'supabase', items: [] }, { status: 502 });

  const items = (await r.json()) as ReviewItem[];
  await attachMyReactions(items);

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
  };
  const r = await fetch(`${SUPA_URL}/rest/v1/reviews`, {
    method: 'POST',
    // RLS: insert в reviews разрешён ТОЛЬКО service_role (аудит, блок 5) —
    // анонимный ключ получал 403 и отзыв не сохранялся.
    headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(item),
  });
  if (!r.ok) return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  return NextResponse.json({ item: (await r.json())[0] ?? item });
}
