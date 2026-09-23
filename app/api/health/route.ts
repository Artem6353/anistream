import { NextResponse } from 'next/server';
import { allTitles } from '@/lib/catalog';
import { uptime as osUptime } from 'node:os';
import { performance } from 'node:perf_hooks';

export const dynamic = 'force-dynamic';

/** Health-эндпоинт для внешних мониторов (A7.2): 200 = живы. */
export async function GET() {
  const t0 = performance.now();
  const total = allTitles().length;
  return NextResponse.json(
    {
      ok: true,
      ts: new Date().toISOString(),
      uptime: Math.round(osUptime()),
      titles: total,
      catalogMs: Math.round(performance.now() - t0),
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
