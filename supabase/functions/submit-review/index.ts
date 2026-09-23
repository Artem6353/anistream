// Edge function: приём отзыва с Turnstile-проверкой (A3.1). RLS insert для anon выключен.
// Deploy: supabase functions deploy submit-review
const SUPA = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_KEY')!;
const TURNSTILE = Deno.env.get('TURNSTILE_SECRET') ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const body = await req.json();
  if (TURNSTILE) {
    const cf = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: TURNSTILE, response: body.turnstile }),
    });
    const cj = await cf.json();
    if (!cj.success) return new Response(JSON.stringify({ error: 'captcha failed' }), { status: 403 });
  }
  const text = String(body.text ?? '').trim().slice(0, 2000);
  if (!body.slug || !text) return new Response(JSON.stringify({ error: 'bad payload' }), { status: 400 });
  const r = await fetch(`${SUPA}/rest/v1/reviews`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ id: crypto.randomUUID(), slug: body.slug, name: String(body.name ?? 'Гость').slice(0, 40), rating: body.rating ?? null, text, ts: Date.now(), likes: 0, dislikes: 0, parent: body.parent ?? null }),
  });
  if (!r.ok) return new Response(JSON.stringify({ error: 'db error' }), { status: 502 });
  return new Response(JSON.stringify({ item: (await r.json())[0] }), { status: 201, headers: { 'Content-Type': 'application/json' } });
});
