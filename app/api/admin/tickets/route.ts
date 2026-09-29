import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import { cookies } from 'next/headers';
import { adminCookieName, verifyAdminCookie } from '@/lib/admin-auth';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY ?? '';

/** Тикеты модерации. Аудит 30.09 (P1-12): жалобы/DMCA пишутся в Supabase
 *  (serverless-совместимо) с файловым фолбэком — здесь читаются ОБА источника
 *  и мержатся (новые сверху), панель модерации видит всё. */
export async function GET() {
  const store = await cookies();
  if (!verifyAdminCookie(store.get(adminCookieName())?.value)) return NextResponse.json({ error: 'нет доступа' }, { status: 403 });

  const readFile = async (f: string): Promise<unknown[]> => {
    try {
      const rows = JSON.parse(await fs.readFile(f, 'utf8'));
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };

  const readSupa = async (table: string): Promise<unknown[]> => {
    if (!SUPA_URL || !SUPA_SERVICE) return [];
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/${table}?order=ts.desc&limit=200`, {
        headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}` },
        cache: 'no-store',
      });
      if (!r.ok) return [];
      const rows = await r.json();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };

  const [dmcaSupa, reportsSupa, dmcaFile, reportsFile] = await Promise.all([
    readSupa('dmca_requests'),
    readSupa('source_reports'),
    readFile('data/dmca.json'),
    readFile('data/reports.json'),
  ]);

  const tsOf = (x: unknown) => (typeof (x as { ts?: unknown })?.ts === 'number' ? ((x as { ts: number }).ts) : 0);
  const byTs = (a: unknown, b: unknown) => tsOf(b) - tsOf(a);
  return NextResponse.json({
    dmca: [...dmcaSupa, ...dmcaFile].sort(byTs),
    reports: [...reportsSupa, ...reportsFile].sort(byTs),
  });
}
