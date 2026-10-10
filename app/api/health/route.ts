import { NextResponse } from 'next/server';
import { allTitles } from '@/lib/catalog';
import { providersWithAvailability } from '@/lib/providers/registry-meta';
import { getProvidersConfig } from '@/lib/config/providers.config';
import { kvEnabled, kvPing } from '@/lib/providers/cache-kv';
import { bridgeHealth } from '@/lib/providers/bridge';
import { uptime as osUptime } from 'node:os';
import { performance } from 'node:perf_hooks';

export const dynamic = 'force-dynamic';

/** Health-эндпоинт для внешних мониторов (A7.2): 200 = живы. */
export async function GET() {
  const t0 = performance.now();
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
    // null means this deployment uses the filesystem cache (no Redis connection to probe).
    reachable: cacheUsesUpstash ? await kvPing() : null,
  };
  return NextResponse.json(
    {
      ok: true,
      ts: new Date().toISOString(),
      uptime: Math.round(osUptime()),
      titles: total,
      catalogMs: Math.round(performance.now() - t0),
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      configuredProviders,
      bridges,
      providerCache,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
