import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AniStream — каталог аниме',
    short_name: 'AniStream',
    description: 'Каталог аниме: подборки, живое расписание эфиров, плеер и локальный профиль.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0d11',
    theme_color: '#0b0d11',
    lang: 'ru',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
