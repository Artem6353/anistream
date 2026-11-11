import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';

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

/* Аудит 2026-11-12: endpoint — это URL, который сервер будет дёргать с ключами
   подписки. Принимаем только https известных push-сервисов (FCM/Mozilla/Apple/
   WNS), иначе произвольный URL становился вектором SSRF/мусорных подписок. */
function validEndpoint(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return (
      h === 'fcm.googleapis.com' ||
      h === 'android.googleapis.com' ||
      h.endsWith('.push.services.mozilla.com') ||
      h === 'web.push.apple.com' ||
      h.endsWith('.push.apple.com') ||
      h.endsWith('.notify.windows.com')
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const sub = (await request.json().catch(() => ({}))) as { endpoint?: string; keys?: unknown };
  if (!sub.endpoint || !validEndpoint(sub.endpoint)) {
    return NextResponse.json({ error: 'bad subscription' }, { status: 400 });
  }

  if (!supabaseConfigured()) {
    return NextResponse.json(
      { ok: false, reason: 'storage unavailable (supabase not configured)' },
      { status: 503 },
    );
  }

  /* Аудит 2026-11-12: атомарный upsert по endpoint (миграция 20261112) вместо
     delete+insert — параллельные запросы больше не теряют/не дублируют подписку.
     Фолбэк на старый путь, пока unique-индекс не применён. */
  const payload = JSON.stringify({
    id: crypto.randomUUID(),
    endpoint: sub.endpoint,
    keys: sub.keys ?? null,
  });
  let ins = await supaFetch('push_subs?on_conflict=endpoint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: payload,
  });
  if (ins.status === 400) {
    const del = await supaFetch(
      `push_subs?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
      { method: 'DELETE' },
    );
    if (!del.ok) {
      log('error', 'push subscribe delete failed', { status: del.status, body: await del.text() });
      return NextResponse.json({ error: 'supabase error' }, { status: 502 });
    }
    ins = await supaFetch('push_subs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: payload,
    });
  }
  if (!ins.ok) {
    log('error', 'push subscribe failed', { status: ins.status, body: await ins.text() });
    return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint || !validEndpoint(endpoint)) {
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
    log('error', 'push unsubscribe failed', { status: del.status, body: await del.text() });
    return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
