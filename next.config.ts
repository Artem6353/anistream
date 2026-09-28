import type { NextConfig } from 'next';

/* Аудит 2026-09-28 P1-1: security-заголовки. CSP сначала в Report-Only режиме:
   неделю собираем нарушения (особенно embed-плееров и Turnstile), затем переключаем
   на enforce, убрав суффикс -Report-Only. */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' https: blob:",
  "worker-src 'self'",
  "connect-src 'self' https://*.supabase.co https://graphql.anilist.co https://shikimori.io https://shikimori.one https://api.jikan.moe https://api.aniskip.com https://challenges.cloudflare.com wss://*.supabase.co",
  "frame-src https://kodik.info https://kodikplayer.com https://animego.org https://cdn.animego.org https://aniboom.one https://www.youtube.com https://challenges.cloudflare.com",
].join('; ');

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
          { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
        ],
      },
    ];
  },
};

export default nextConfig;
