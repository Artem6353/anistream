import { NextResponse } from 'next/server';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

function supabaseConfigured(): boolean {
  return Boolean(SUPA_URL && SUPA_KEY);
}

async function supaFetch(path: string, init: RequestInit = {}) {
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

export async function POST(request: Request) {
  const sub = (await request.json()) as { endpoint?: string; keys?: unknown };
  if (!sub.endpoint) {
    return NextResponse.json({ error: 'bad subscription' }, { status: 400 });
  }

  if (!supabaseConfigured()) {
    return NextResponse.json(
      { ok: false, reason: 'storage unavailable (supabase not configured)' },
      { status: 503 },
    );
  }

  // Удаляем старую запись с этим endpoint (если была) — получаем upsert по endpoint
  const del = await supaFetch(
    `push_subs?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
    { method: 'DELETE' },
  );
  if (!del.ok) {
    console.error('[push/subscribe] delete failed', del.status, await del.text());
    return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  }

  const ins = await supaFetch('push_subs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      endpoint: sub.endpoint,
      keys: sub.keys ?? null,
    }),
  });
  if (!ins.ok) {
    console.error('[push/subscribe] insert failed', ins.status, await ins.text());
    return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
  }

  if (!supabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: 'storage unavailable' }, { status: 503 });
  }

  const del = await supaFetch(
    `push_subs?endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: 'DELETE' },
  );
  if (!del.ok) {
    console.error('[push/unsubscribe] failed', del.status, await del.text());
    return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}