import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Пул инстансов bridge (KODIK_BRIDGE_URLS / MULTIPLAYER_BRIDGE_URLS).
 *
 * Зачем: один процесс bridge ограничен BRIDGE_UPSTREAM_CONC (4 у Kodik), поэтому
 * гидрация упирается в него. Второй и третий инстансы на других портах дают
 * линейный прирост — клиент должен размазывать запросы и не залипать на упавшем.
 *
 * Сеть не используется: fetch заменён заглушкой.
 */

type Call = { url: string; method: string };

/** Минимальный ProviderContext: тесту важны только URL и round-robin. */
const ctx = (episode: number) => ({ slug: 'x', animeId: 1, episode } as never);

const calls: Call[] = [];
let healthState: Record<string, boolean> = {};

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      calls.push({ url, method });
      if (url.endsWith('/health')) {
        const host = new URL(url).host;
        const ok = healthState[host] !== false;
        return ok ? Response.json({ ok: true }) : new Response('down', { status: 503 });
      }
      return Response.json({ sources: [{ translationId: '1', label: 'voice', embedUrl: 'https://example.test/embed' }] });
    }),
  );
}

async function load() {
  return import('@/lib/providers/bridge');
}

beforeEach(() => {
  calls.length = 0;
  healthState = {};
  stubFetch();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('bridgeResolve: round-robin по пулу', () => {
  it('распределяет /resolve между инстансами', async () => {
    const { bridgeResolve } = await load();
    const opts = { baseUrl: 'http://a.test', baseUrls: ['http://a.test', 'http://b.test'], timeoutMs: 1000 };
    await bridgeResolve(opts, 'kodik', ctx(1));
    await bridgeResolve(opts, 'kodik', ctx(2));
    const hosts = calls.filter((c) => c.method === 'POST').map((c) => new URL(c.url).host);
    expect(hosts).toEqual(['a.test', 'b.test']);
  });

  it('мёртвый инстанс пропускается, живому достаются все запросы', async () => {
    healthState = { 'a.test': false };
    const { bridgeResolve } = await load();
    const opts = { baseUrl: 'http://a.test', baseUrls: ['http://a.test', 'http://b.test'], timeoutMs: 1000 };
    await bridgeResolve(opts, 'kodik', ctx(1));
    await bridgeResolve(opts, 'kodik', ctx(2));
    const hosts = calls.filter((c) => c.method === 'POST').map((c) => new URL(c.url).host);
    expect(hosts).toEqual(['b.test', 'b.test']);
  });

  it('одиночный baseUrl работает как раньше (back-compat)', async () => {
    const { bridgeResolve, bridgePool } = await load();
    const opts = { baseUrl: 'http://solo.test', timeoutMs: 1000 };
    expect(bridgePool(opts)).toEqual(['http://solo.test']);
    const res = await bridgeResolve(opts, 'cvh', ctx(1));
    expect(res.sources).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'POST').map((c) => new URL(c.url).host)).toEqual(['solo.test']);
  });

  it('весь пул недоступен → пустой результат с причиной, без исключения', async () => {
    healthState = { 'a.test': false, 'b.test': false };
    const { bridgeResolve } = await load();
    const res = await bridgeResolve(
      { baseUrl: 'http://a.test', baseUrls: ['http://a.test', 'http://b.test'], timeoutMs: 500 },
      'kodik',
      ctx(1),
    );
    expect(res.sources).toEqual([]);
    expect(res.error).toMatch(/bridge offline/);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('resolveBridgeUrls: разбор конфига', () => {
  it('KODIK_BRIDGE_URLS (запятые/пробелы) → пул, дубликаты убираются', async () => {
    vi.stubEnv('KODIK_BRIDGE_URLS', ' http://127.0.0.1:8765, http://127.0.0.1:8767  http://127.0.0.1:8765 ');
    vi.resetModules();
    const { getProvidersConfig } = await import('@/lib/config/providers.config');
    const cfg = getProvidersConfig();
    expect(cfg.bridges.kodik.urls).toEqual(['http://127.0.0.1:8765', 'http://127.0.0.1:8767']);
    expect(cfg.bridges.kodik.url).toBe('http://127.0.0.1:8765'); // первый — для логов/совместимости
    vi.unstubAllEnvs();
  });

  it('пусто → прежний одиночный URL', async () => {
    vi.stubEnv('KODIK_BRIDGE_URL', 'http://127.0.0.1:9999');
    vi.resetModules();
    const { getProvidersConfig } = await import('@/lib/config/providers.config');
    expect(getProvidersConfig().bridges.kodik.urls).toEqual(['http://127.0.0.1:9999']);
    vi.unstubAllEnvs();
  });
});
