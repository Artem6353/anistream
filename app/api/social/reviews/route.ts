import { NextResponse } from 'next/server';
import { rateLimit, supabaseConfigured, verifyCaptcha } from '@/lib/social-server';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPA_SERVICE =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  if (!supabaseConfigured()) return NextResponse.json({ mode: 'local', items: [] });
  const r = await fetch(
    `${SUPA_URL}/rest/v1/reviews?slug=eq.${encodeURIComponent(slug)}&order=ts.desc&limit=200`,
    { headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } },
  );
  if (!r.ok) return NextResponse.json({ mode: 'supabase', items: [] }, { status: 502 });
  return NextResponse.json({ mode: 'supabase', items: await r.json() });
}

export async function POST(request: Request) {
  if (!supabaseConfigured())
    return NextResponse.json(
      { error: 'общий режим выключен: используйте локальные отзывы' },
      { status: 409 },
    );
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
  if (!rateLimit(ip))
    return NextResponse.json({ error: 'слишком часто, подождите минуту' }, { status: 429 });
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
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(item),
  });
  if (!r.ok) return NextResponse.json({ error: 'supabase error' }, { status: 502 });
  return NextResponse.json({ item: (await r.json())[0] ?? item });
}