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
  providerMode: 'merge';
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
  const productionHost = (env.VERCEL_PROJECT_PRODUCTION_URL ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const vercelProd = productionHost && !productionHost.includes('/')
    ? `https://${productionHost}`
    : '';
  const fromEnv = (env.NEXT_PUBLIC_SITE_URL ?? '').trim();

  if (fromEnv) {
    try {
      const parsed = new URL(fromEnv);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return vercelProd || 'http://localhost:3000';
      const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      const loopback = ['localhost', '127.0.0.1', '::1'].includes(host) || host.endsWith('.localhost');
      const staleVercelHost = host.endsWith('.vercel.app') && Boolean(vercelProd);

      // A local development URL must never override Vercel's known production host.
      if (!(env.VERCEL && loopback) && !staleVercelHost) return parsed.origin;
    } catch {
      /* Invalid/whitespace values fall through to the known Vercel host or local default. */
    }
  }

  return vercelProd || 'http://localhost:3000';
}

/** В Vercel 127.0.0.1 указывает на сам serverless-контейнер, а не на локальный Python bridge. */
function resolveBridgeUrl(
  env: NodeJS.ProcessEnv,
  urlKey: string,
  portKey: string,
  fallbackPort: number,
): string {
  const configured = env[urlKey];
  const value = configured !== undefined
    ? configured
    : env.VERCEL
      ? ''
      : env[portKey]
        ? `http://127.0.0.1:${env[portKey]}`
        : `http://127.0.0.1:${fallbackPort}`;
  if (!value.trim()) return '';
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (env.VERCEL && ['localhost', '127.0.0.1', '::1'].includes(host)) return '';
  } catch {
    /* Валидность URL окончательно проверит fetch; здесь не падаем при загрузке конфига. */
  }
  return value.replace(/\/+$/, '');
}

export function getProvidersConfig(): ProvidersConfig {
  const env = process.env;
  return {
    site: {
      name: env.NEXT_PUBLIC_SITE_NAME?.trim() || 'AniNova',
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
        url: resolveBridgeUrl(env, 'KODIK_BRIDGE_URL', 'KODIK_BRIDGE_PORT', 8765),
        timeoutMs: num(env.KODIK_BRIDGE_TIMEOUT_MS, 6000),
      },
      multiplayer: {
        url: resolveBridgeUrl(env, 'MULTIPLAYER_BRIDGE_URL', 'MULTIPLAYER_BRIDGE_PORT', 8766),
        timeoutMs: num(env.MULTIPLAYER_BRIDGE_TIMEOUT_MS, 6000),
      },
    },
    providerMode: 'merge',
    providerTimeoutMs: num(env.PROVIDER_TIMEOUT_MS, 6000),
    cache: {
      enabled: bool(env.PROVIDER_CACHE_ENABLED, true),
      write: bool(env.PROVIDER_CACHE_WRITE, true),
      ttlMs: num(env.KODIK_CACHE_TTL_MS, 86_400_000),
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
