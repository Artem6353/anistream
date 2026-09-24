import { NextResponse } from 'next/server';
import { getOrCreateUserId } from '@/lib/userId';
import { rateLimit, supabaseConfigured } from '@/lib/social-server';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function supaFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: 'общий режим выключен' }, { status: 409 });
  }

  const { id: reviewId } = await params;
  if (!reviewId) {
    return NextResponse.json({ error: 'review id required' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
  if (!rateLimit(`react:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'слишком часто' }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { kind?: 'like' | 'dislike' };
  const kind = body.kind;
  if (kind !== 'like' && kind !== 'dislike') {
    return NextResponse.json({ error: 'kind must be like or dislike' }, { status: 400 });
  }

  const userId = await getOrCreateUserId();

  // 1) Читаем предыдущий голос этого пользователя
  const existingRes = await supaFetch(
    `review_reactions?review_id=eq.${encodeURIComponent(reviewId)}&user_id=eq.${encodeURIComponent(userId)}&select=kind`,
  );
  if (!existingRes.ok) {
    return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  }
  const existing = (await existingRes.json()) as Array<{ kind: 'like' | 'dislike' }>;
  const prev = existing[0]?.kind ?? null;

  // 2) Мутируем только review_reactions: insert / delete / update.
  //    reviews.likes / reviews.dislikes НЕ трогаем: их пересчитывает
  //    триггер в БД (after insert/update/delete on review_reactions → count(*)).
  //    Любая запись сюда по схеме read-modify-write конфликтует с триггером
  //    и даёт двойной счётчик (один клик → +2).
  if (prev === null) {
    const ins = await supaFetch('review_reactions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ review_id: reviewId, user_id: userId, kind }),
    });
    if (!ins.ok) return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  } else if (prev === kind) {
    const del = await supaFetch(
      `review_reactions?review_id=eq.${encodeURIComponent(reviewId)}&user_id=eq.${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    );
    if (!del.ok) return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  } else {
    const upd = await supaFetch(
      `review_reactions?review_id=eq.${encodeURIComponent(reviewId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ kind }),
      },
    );
    if (!upd.ok) return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  }

  // 3) Читаем актуальные счётчики из reviews одним запросом:
  //    эти значения уже посчитаны триггером — их и возвращаем клиенту.
  const reviewRes = await supaFetch(
    `reviews?id=eq.${encodeURIComponent(reviewId)}&select=likes,dislikes`,
  );
  if (!reviewRes.ok) return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  const review = ((await reviewRes.json()) as Array<{ likes: number; dislikes: number }>)[0];

  return NextResponse.json({
    ok: true,
    likes: review?.likes ?? 0,
    dislikes: review?.dislikes ?? 0,
    myReaction: prev === kind ? null : kind,
  });
}
