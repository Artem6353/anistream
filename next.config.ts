import type { NextConfig } from 'next';

/* ТЗ5 3.4 (SuperSEO security 75→100): CSP переключён с Report-Only на enforce —
   анализатор проверяет наличие заголовка Content-Security-Policy. Политика та же,
   что собиралась в Report-Only (аудит 2026-09-28 P1-1): embed-плееры, Turnstile,
   Supabase, AniList/Shikimori/Jikan/AniSkip учтены. Дополнительно:
   - upgrade-insecure-requests — лечит смешанный контент (ТЗ5 3.8 «HTTPS включён»);
   - Sentry ingest и хост аналитики из NEXT_PUBLIC_ANALYTICS_SRC/DOMAIN (env-driven,
     чтобы Plausible/self-hosted Umami не отвалились после enforce);
   - в dev CSP остаётся Report-Only: enforce ломает webpack-HMR websocket. */
const analyticsHosts = (() => {
  const hosts = new Set<string>();
  for (const raw of [process.env.NEXT_PUBLIC_ANALYTICS_SRC, process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN]) {
    if (!raw) continue;
    try {
      const u = new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`);
      hosts.add(u.hostname);
    } catch {
      /* невалидное значение env — игнорируем */
    }
  }
  return [...hosts];
})();
const analyticsScriptSrc = analyticsHosts.map((h) => `https://${h}`).join(' ');
/* S5: Метрика включает mc.yandex.ru в CSP только при установленном счётчике —
   иначе директивы остаются минимальными. */
const metrikaSrc = process.env.NEXT_PUBLIC_METRIKA_ID ? 'https://mc.yandex.ru' : '';
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  /* Аудит 30.09 (P1-8), документированное решение: 'unsafe-inline' в script-src
     СОХРАНЁН сознательно — App Router инжектит inline flight-скрипты
     (self.__next_f.push) в каждую страницу; nonce-based CSP требует per-request
     nonce и делает ВСЕ страницы динамическими, убивая ISR/статику (revalidate
     3600/1800, защита от ISR-storm в LIMITS.md). Hash-based CSP для flight-
     скриптов невозможен (контент уникален на запрос). Компенсирующие меры:
     JSON-LD экранируется (\u003c), OAuth — PKCE (токенов в URL нет),
     object-src 'none', frame-ancestors 'none', XFO DENY. Полный nonce-вариант
     станет возможен при переезде на PPR/dynamic-рендеринг — см. ROADMAP. */
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com ${analyticsScriptSrc} ${metrikaSrc}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' https: blob:",
  "worker-src 'self'",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://graphql.anilist.co https://shikimori.io https://shikimori.one https://api.jikan.moe https://api.aniskip.com https://challenges.cloudflare.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io ${analyticsScriptSrc} ${metrikaSrc}`.trim(),
  /* баг 29.09: embed CVH реально живёт на animego.me (cdn-iframe), а не animego.org —
     без .me enforce-CSP блокировал плеер («This content is blocked»). */
  `frame-src https://kodik.info https://kodikplayer.com https://animego.org https://cdn.animego.org https://animego.me https://cdn.animego.me https://aniboom.one https://www.youtube.com https://challenges.cloudflare.com ${metrikaSrc}`.trim(),
];
const CSP_VALUE = CSP_DIRECTIVES.join('; ');
const IS_PROD = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* S1.1 (аудит 28.09): sharp используется image-прокси /img для транскода (avif/webp)
     и ресайза — нативный пакет, не бандлится webpack'ом, трекается nft в функцию Vercel. */
  serverExternalPackages: ['sharp'],
  outputFileTracingIncludes: {
    '/**': ['./lib/data/titles.json'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's4.anilist.co' },
      { protocol: 'https', hostname: 'shikimori.one' },
      { protocol: 'https', hostname: 'img2.shikimori.io' },
      { protocol: 'https', hostname: 'shikimori.io' },
      { protocol: 'https', hostname: 'kodikstorage.com' },
      { protocol: 'https', hostname: 'cdn.myanimelist.net' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          /* ТЗ5 3.4: в проде — enforce (Content-Security-Policy), в dev — Report-Only
             (HMR-websocket не проходит connect-src 'self'). */
          {
            key: IS_PROD ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
            value: CSP_VALUE,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
