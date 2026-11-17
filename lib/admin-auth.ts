import { createHmac, timingSafeEqual } from 'node:crypto';

/** Админ-аутентификация: httpOnly-cookie с HMAC-подписью вместо токена в URL (W4). */
const COOKIE = 'anistream_admin';
const DAY = 86400_000;

/**
 * Сравнение секретов без утечки длины/префикса во времени (аудит P2-9).
 * sha256 выравнивает длины, `timingSafeEqual` не выходит раньше на первом
 * несовпадении. Пустые строки всегда false — «пустой токен» не должен совпадать
 * с пустой настройкой env.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = createHmac('sha256', 'aninova-compare').update(a).digest();
  const hb = createHmac('sha256', 'aninova-compare').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function secret(): string {
  return process.env.ADMIN_TOKEN ?? '';
}

export function adminCookieName(): string {
  return COOKIE;
}

export function signAdmin(exp: number): string {
  return createHmac('sha256', secret()).update(`admin|${exp}`).digest('hex');
}

export function makeAdminCookieValue(days = 7): { value: string; expires: Date } {
  const exp = Date.now() + days * DAY;
  return { value: `${exp}.${signAdmin(exp)}`, expires: new Date(exp) };
}

export function verifyAdminCookie(value: string | undefined): boolean {
  if (!value || !secret()) return false;
  const [expStr, sig] = value.split('.');
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expect = Buffer.from(signAdmin(exp));
  const got = Buffer.from(sig ?? '');
  return expect.length === got.length && timingSafeEqual(expect, got);
}
