import type { NextConfig } from 'next';

/* Изолированный прототип B1-A. Никакой связи с production-конфигом основного
   приложения: здесь нет Supabase, CSP-политики плеера, ISR-кэшей и аналитики.
   Задача приложения — рендерить макеты трёх концепций и их состояния. */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /* Корень Turbopack фиксируем явно: рабочий каталог — отдельное мини-приложение
     внутри worktree основного репозитория, и без этого Next ищет lockfile выше. */
  turbopack: { root: process.cwd() },
  agentRules: false,
  devIndicators: false,
  images: {
    // Локальные mock-ассеты в /public/design. Никаких внешних CDN-доменов.
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [390, 640, 768, 1024, 1440, 1920],
  },
};

export default nextConfig;
