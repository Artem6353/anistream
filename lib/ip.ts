/**
 * Определение клиентского IP для rate-limit.
 *
 * Правило доверия (аудит P2-10): IP берётся только из заголовков, которые
 * ДОПИСЫВАЕТ доверенная инфраструктура, и никогда — из подделываемого клиентом
 * значения:
 *   1) `x-vercel-forwarded-for` — ставит платформа Vercel (клиентское значение
 *      перезаписывается), первый элемент = реальный клиент;
 *   2) `cf-connecting-ip` — Cloudflare (Turnstile уже в стеке), один адрес;
 *   3) последний элемент `x-forwarded-for` — его дописывает доверенный прокси
 *      (Caddy/Nginx/Netlify); первый элемент контролируется клиентом и ранее
 *      позволял обнулять бакет каждым запросом;
 *   4) `x-real-ip` — ТОЛЬКО если XFF отсутствует (конфигурация «один прокси»).
 *
 * Раньше `x-real-ip` был приоритетнее XFF: клиент мог прислать `x-real-ip: <rand>`
 * и обойти ВСЕ лимиты (включая 5/мин на admin-login), если прокси этот заголовок
 * не перезаписывает. Теперь подделанный `x-real-ip` при наличии XFF игнорируется.
 */

/** Нормализация значения заголовка: первый IP из списка, trim, нижний регистр IPv6-обёртки. */
function firstIp(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  return first || null;
}

/** Последний (доверенный) элемент XFF — его дописывает прокси на выходе. */
function lastIp(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split(',');
  return parts[parts.length - 1]?.trim() || null;
}

export function clientIp(request: Request): string {
  const vercel = firstIp(request.headers.get('x-vercel-forwarded-for'));
  if (vercel) return vercel;

  const cloudflare = firstIp(request.headers.get('cf-connecting-ip'));
  if (cloudflare) return cloudflare;

  const forwarded = lastIp(request.headers.get('x-forwarded-for'));
  if (forwarded) return forwarded;

  /* Без XFF доверять x-real-ip можно: его ставит единственный прокси перед
     приложением (схема self-hosted Caddy). Пустое значение — 'local'. */
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;

  return 'local';
}
