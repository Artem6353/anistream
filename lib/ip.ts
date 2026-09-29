/**
 * Определение клиентского IP для rate-limit (аудит 30.09, P1-6).
 *
 * Раньше брали ПЕРВЫЙ элемент x-forwarded-for — он контролируется клиентом
 * (заголовок можно подделать и обнулять бакет лимита каждым запросом).
 * И Vercel, и Caddy ДОПИСЫВАЮТ реальный клиентский IP в конец списка,
 * поэтому доверенным считается ПОСЛЕДНИЙ элемент. x-real-ip (Caddy) —
 * приоритетный фолбэк, 'local' — для прямых обращений без прокси.
 */
export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim() || 'local';
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',');
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }
  return 'local';
}
