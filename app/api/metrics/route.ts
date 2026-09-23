import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';
import { metricsSnapshot } from '@/lib/metrics';

export async function GET() {
  const store = await cookies();
  if (!verifyAdminCookie(store.get(adminCookieName())?.value)) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  return NextResponse.json(metricsSnapshot());
}
