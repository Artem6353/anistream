/** POST {token} → httpOnly-cookie на 7 дней. Токен в URL больше не используется.
 *  Аудит 30.09 (P0-4): сравнение токена — константное (sha256 + timingSafeEqual),
 *  брутфорс закрыт rate-limit'ом /api/admin/login (5/мин, lib/rateLimit.ts). */
import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { makeAdminCookieValue, adminCookieName } from '@/lib/admin-auth';

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: Request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return NextResponse.json({ error: 'ADMIN_TOKEN не задан в env' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  if (typeof body.token !== 'string' || !safeEqual(body.token, expected)) {
    return NextResponse.json({ error: 'неверный токен' }, { status: 403 });
  }
  const { value, expires } = makeAdminCookieValue();
  const res = NextResponse.json({ ok: true, redirect: '/admin' });
  res.cookies.set(adminCookieName(), value, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', expires });
  return res;
}
