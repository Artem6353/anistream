/**
 * Конфигурация провайдеров и внешних источников из окружения.
 * Схема переменных совместима с .env.example исходного проекта,
 * чтобы перенос конфигурации был drop-in.
 */

export interface ProvidersConfig {
  site: { name: string; url: string };
  demo: { listed: boolean };
  kodik: {
    enabled: boolean;
    token?: string;
    apiUrl: string;
    timeoutMs: number;
    episodeSearchLimit: number;
  };
  aniboom: { enabled: boolean; token?: string };
  cache: { enabled: boolean; write: boolean; ttlMs: number; file: string };
  bridges: {
    kodik: { url: string; timeoutMs: number };
    multiplayer: { url: string; timeoutMs: number };
  };
  providerMode: 'merge' | 'first';
  providerTimeoutMs: number;
  shikimori: { enabled: boolean; userAgent: string };
  aniskip: { enabled: boolean };
}

const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** S3.0 (аудит 28.09): resolution продакшен-URL сайта.
 *  Инцидент: NEXT_PUBLIC_SITE_URL на Vercel указывает anistream.vercel.app — домен
 *  после переименования проекта отошёл третьему лицу (отдаёт чужой сайт), а
 *  sitemap.xml/robots.txt/canonical продолжали ссылаться на него.
 *  Приоритет: кастомный домен из env (явный) → фактический прод-домен Vercel
 *  (VERCEL_PROJECT_PRODUCTION_URL) → localhost. Значения *.vercel.app в env
 *  считаются устаревшими, если известен фактический прод-домен Vercel. */
function resolveSiteUrl(env: NodeJS.ProcessEnv): string {
  const vercelProd = env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : '';
  const fromEnv = env.NEXT_PUBLIC_SITE_URL ?? '';
  if (fromEnv) {
    try {
      const host = new URL(fromEnv).hostname;
      if (!host.endsWith('.vercel.app') || !vercelProd) return fromEnv;
    } catch {
      /* невалидный URL — падаем дальше */
    }
  }
  return vercelProd || fromEnv || 'http://localhost:3000';
}

export function getProvidersConfig(): ProvidersConfig {
  const env = process.env;
  return {
    site: {
      name: env.NEXT_PUBLIC_SITE_NAME ?? 'AniNova',
      url: resolveSiteUrl(env),
    },
    demo: {
      /* DEMO_PROVIDER_ENABLED (новый формат) или DEMO_ENABLED (старый) */
      listed: bool(env.DEMO_PROVIDER_ENABLED, bool(env.DEMO_ENABLED, true)),
    },
    kodik: {
      enabled: bool(env.KODIK_ENABLED, Boolean(env.KODIK_TOKEN)),
      token: env.KODIK_TOKEN,
      apiUrl: env.KODIK_API_BASE_URL ?? 'https://kodik-api.com',
      timeoutMs: num(env.KODIK_TIMEOUT_MS, 5000),
      episodeSearchLimit: num(env.KODIK_EPISODE_SEARCH_LIMIT, 10),
    },
    aniboom: {
      enabled: bool(env.ANIBOOM_ENABLED, false) && Boolean(env.ANIBOOM_TOKEN),
      token: env.ANIBOOM_TOKEN,
    },
    bridges: {
      kodik: {
        url: env.KODIK_BRIDGE_URL ?? (env.KODIK_BRIDGE_PORT ? `http://127.0.0.1:${env.KODIK_BRIDGE_PORT}` : 'http://127.0.0.1:8765'),
        timeoutMs: num(env.KODIK_BRIDGE_TIMEOUT_MS, 12000),
      },
      multiplayer: {
        url: env.MULTIPLAYER_BRIDGE_URL ?? (env.MULTIPLAYER_BRIDGE_PORT ? `http://127.0.0.1:${env.MULTIPLAYER_BRIDGE_PORT}` : 'http://127.0.0.1:8766'),
        timeoutMs: num(env.MULTIPLAYER_BRIDGE_TIMEOUT_MS, 8000),
      },
    },
    providerMode: env.PROVIDER_MODE === 'first' ? 'first' : 'merge',
    providerTimeoutMs: num(env.PROVIDER_TIMEOUT_MS, 6000),
    cache: {
      enabled: bool(env.PROVIDER_CACHE_ENABLED, true),
      write: bool(env.PROVIDER_CACHE_WRITE, true),
      ttlMs: num(env.KODIK_CACHE_TTL_MS, 600_000),
      file: env.KODIK_CACHE_FILE ?? '.cache/providers-resolve-cache.json',
    },
    shikimori: {
      enabled: bool(env.SHIKIMORI_ENABLED, true),
      userAgent: env.SHIKIMORI_USER_AGENT ?? 'AniNova/2.0 (+http://localhost:3000)',
    },
    aniskip: {
      enabled: bool(env.ANISKIP_ENABLED, true),
    },
  };
}
