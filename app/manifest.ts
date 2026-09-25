import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AniNova — каталог аниме',
    short_name: 'AniNova',
    description: 'Каталог аниме: подборки, живое расписание эфиров, плеер и локальный профиль.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0d11',
    theme_color: '#0b0d11',
    lang: 'ru',
    icons: [
      { src: '/logo-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/logo-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/logo-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/favicon.png', sizes: '32x32', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      { src: '/logo-icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
