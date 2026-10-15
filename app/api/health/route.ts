import { NextResponse } from 'next/server';
import { allTitles, catalogSourceInfo } from '@/lib/catalog';
import { providersWithAvailability } from '@/lib/providers/registry-meta';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { kvEnabled, kvPing } from '@/lib/providers/cache-kv';
import { bridgeHealth } from '@/lib/providers/bridge';
import { uptime as osUptime } from 'node:os';
import { performance } from 'node:perf_hooks';

export const dynamic = 'force-dynamic';

/** Health-эндпоинт для внешних мониторов (A7.2): 200 = живы.
    ?probe=1 добавляет диагностику достижимости Supabase (HTTP-статусы REST без
    тела и без раскрытия ключей) — для поиска «почему источники пусты» на новом
    хостинге (инцидент Netlify 2026-10-15). */
export async function GET(request: Request) {
  const t0 = performance.now();
  const wantProbe = new URL(request.url).searchParams.get('probe') === '1';
  const total = allTitles().length;
  const providerConfig = getProvidersConfig();
  // This is configuration readiness, not a network health probe. Bridge URLs can
  // be configured while the bridge itself is offline; that is checked on resolve.
  const configuredProviders = providersWithAvailability().map(({ id, available }) => ({
    id,
    configured: available,
  }));
  const cacheUsesUpstash = providerConfig.cache.enabled && kvEnabled();
  const kodikBridgeUrl = providerConfig.bridges.kodik.url;
  const multiplayerBridgeUrl = providerConfig.bridges.multiplayer.url;
  const [kodikBridgeResult, multiplayerBridgeResult] = await Promise.all([
    kodikBridgeUrl
      ? bridgeHealth({ baseUrl: kodikBridgeUrl, timeoutMs: providerConfig.bridges.kodik.timeoutMs })
      : Promise.resolve(null),
    multiplayerBridgeUrl
      ? bridgeHealth({ baseUrl: multiplayerBridgeUrl, timeoutMs: providerConfig.bridges.multiplayer.timeoutMs })
      : Promise.resolve(null),
  ]);
  const bridges = {
    kodik: { configured: Boolean(kodikBridgeUrl), reachable: kodikBridgeResult?.ok ?? null },
    multiplayer: { configured: Boolean(multiplayerBridgeUrl), reachable: multiplayerBridgeResult?.ok ?? null },
  };
  const providerCache = {
    enabled: providerConfig.cache.enabled,
    writesEnabled: providerConfig.cache.write,
    backend: !providerConfig.cache.enabled ? 'disabled' : cacheUsesUpstash ? 'upstash' : 'file',
    // Version 1 declares support for the losslessly compressed z1: episode-cache values.
    episodeCacheFormatVersion: 1,
    // null means this deployment uses the filesystem cache (no Redis connection to probe).
    reachable: cacheUsesUpstash ? await kvPing() : null,
  };
  let supabaseProbe: { titles: number | string; episodeSources: number | string } | undefined;
  if (wantProbe) {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const ping = async (path: string): Promise<number | string> => {
      if (!url || !key) return 'not-configured';
      try {
        const r = await fetch(`${url}/rest/v1/${path}`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(5000),
          cache: 'no-store',
        });
        return r.status;
      } catch (e) {
        return e instanceof Error ? e.name : 'error';
      }
    };
    supabaseProbe = {
      titles: await ping('titles?select=id&limit=1'),
      episodeSources: await ping('episode_sources?select=anime_id&limit=1'),
    };
  }
  return NextResponse.json(
    {
      ok: true,
      ts: new Date().toISOString(),
      uptime: Math.round(osUptime()),
      titles: total,
      /* ТЗ 2.1: видно, откуда фактически прочитан каталог (db или файловый fallback). */
      catalog: catalogSourceInfo(),
      catalogMs: Math.round(performance.now() - t0),
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabaseProbe,
      configuredProviders,
      bridges,
      providerCache,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
