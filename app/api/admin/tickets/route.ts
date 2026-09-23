import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { cookies } from 'next/headers';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';

export async function GET() {
  const store = await cookies();
  if (!verifyAdminCookie(store.get(adminCookieName())?.value)) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });
  const read = async (f: string) => {
    try {
      return JSON.parse(await fs.readFile(f, 'utf8'));
    } catch {
      return [];
    }
  };
  return NextResponse.json({ dmca: await read('data/dmca.json'), reports: await read('data/reports.json') });
}
