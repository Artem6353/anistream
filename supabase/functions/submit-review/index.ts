// Edge function: приём отзыва с Turnstile-проверкой (A3.1). RLS insert для anon выключен.
// Deploy: supabase functions deploy submit-review
//
// Аудит 30.09 (P1-13): функция дублирует /api/social/reviews и при деплое была бы
// публичным каналом записи БЕЗ лимитов и CORS-обработчика. Добавлены:
//   - OPTIONS/CORS (браузерный preflight раньше падал);
//   - in-memory rate-limit по IP (10/мин, 100/час);
//   - валидация slug/parent и обязательный Turnstile, если секрет задан.
const SUPA = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_KEY')!;
const TURNSTILE = Deno.env.get('TURNSTILE_SECRET') ?? '';
const ORIGIN = Deno.env.get('SITE_ORIGIN') ?? '*';

const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '600',
};

/* Простой скользящий лимит (in-memory на инстанс — для edge достаточно как анти-шторм). */
const HITS = new Map<string, number[]>();
function rateOk(ip: string): boolean {
  const now = Date.now();
  const hits = (HITS.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  const lastMinute = hits.filter((t) => now - t < 60_000).length;
  if (lastMinute >= 10 || hits.length >= 100) {
    HITS.set(ip, hits);
    return false;
  }
  hits.push(now);
  HITS.set(ip, hits);
  if (HITS.size > 5000) {
    for (const [k, v] of HITS) if (!v.some((t) => now - t < 3_600_000)) HITS.delete(k);
  }
  return true;
}

const json = (obj: unknown, status: number) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ?? 'unknown';
  if (!rateOk(ip)) return json({ error: 'too many requests' }, 429);

  const body = await req.json().catch(() => ({}));
  if (TURNSTILE) {
    const cf = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: TURNSTILE, response: body.turnstile }),
    });
    const cj = await cf.json();
    if (!cj.success) return json({ error: 'captcha failed' }, 403);
  }
  const text = String(body.text ?? '').trim().slice(0, 2000);
  const slug = typeof body.slug === 'string' ? body.slug.slice(0, 120) : '';
  if (!slug || !text) return json({ error: 'bad payload' }, 400);
  const rating = typeof body.rating === 'number' && Number.isFinite(body.rating) ? Math.min(10, Math.max(1, body.rating)) : null;
  const r = await fetch(`${SUPA}/rest/v1/reviews`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      slug,
      name: String(body.name ?? 'Гость').slice(0, 40),
      rating,
      text,
      ts: Date.now(),
      likes: 0,
      dislikes: 0,
      parent: typeof body.parent === 'string' ? body.parent.slice(0, 64) : null,
    }),
  });
  if (!r.ok) return json({ error: 'db error' }, 502);
  return json({ item: (await r.json())[0] }, 201);
});
