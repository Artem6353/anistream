import { createHmac, timingSafeEqual } from 'node:crypto';

/** Админ-аутентификация: httpOnly-cookie с HMAC-подписью вместо токена в URL (W4). */
const COOKIE = 'anistream_admin';
const DAY = 86400_000;

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
