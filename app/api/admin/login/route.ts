import { NextResponse } from 'next/server';
import { makeAdminCookieValue, adminCookieName } from '@/lib/admin-auth';

/** POST {token} → httpOnly-cookie на 7 дней. Токен в URL больше не используется. */
export async function POST(request: Request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return NextResponse.json({ error: 'ADMIN_TOKEN не задан в env' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  if (body.token !== expected) return NextResponse.json({ error: 'неверный токен' }, { status: 403 });
  const { value, expires } = makeAdminCookieValue();
  const res = NextResponse.json({ ok: true, redirect: '/admin' });
  res.cookies.set(adminCookieName(), value, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', expires });
  return res;
}
