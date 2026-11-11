/**
 * Определение клиентского IP для rate-limit (аудит 30.09 P1-6 + аудит 2026-11-12).
 *
 * x-forwarded-for: доверенным считается ПОСЛЕДНИЙ элемент — его дописывает
 * прокси (Vercel/Caddy), первый контролируется клиентом.
 *
 * x-real-ip доверяем ТОЛЬКО за доверенным прокси: Vercel перезаписывает его сам,
 * Caddy (deploy/Caddyfile) — тоже. Netlify и прямой доступ — НЕТ: клиент шлёт
 * случайный x-real-ip на каждый запрос и обнуляет бакеты всех лимитов.
 * TRUST_PROXY_HEADERS=1 — для self-hosted за прокси, который ставит x-real-ip.
 */
export function clientIp(request: Request): string {
  const trustRealIp = Boolean(process.env.VERCEL) || process.env.TRUST_PROXY_HEADERS === '1';
  if (trustRealIp) {
    const real = request.headers.get('x-real-ip');
    if (real?.trim()) return real.trim();
  }
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',');
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }
  return 'local';
}
