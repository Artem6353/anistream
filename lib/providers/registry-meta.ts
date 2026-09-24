import { hashStr } from '../format';
import { getProvidersConfig } from '@/lib/config/providers.config';
import type { ProviderMeta } from './types';

/** Мета-часть реестра: доступна клиенту и серверу, без тяжёлых импортов. */

export const PROVIDER_IDS = ['demo', 'kodik', 'cvh', 'aniboom'] as const;

export const PROVIDERS: ProviderMeta[] = [
  { id: 'demo', label: 'AniStream Demo', hint: 'Публичные тестовые потоки, работают без ключей', available: true },
  { id: 'kodik', label: 'Kodik', hint: 'bridge 8765 / KODIK_TOKEN', available: false },
  { id: 'cvh', label: 'CVH (AnimeGo)', hint: 'multi-player bridge 8766', available: false },
  { id: 'aniboom', label: 'AniBoom', hint: 'multi-player bridge 8766', available: false },
];

export function providersWithAvailability(): ProviderMeta[] {
  const cfg = getProvidersConfig();
  return PROVIDERS.map((p) => {
    switch (p.id) {
      case 'demo':
        return { ...p, available: cfg.demo.listed };
      case 'kodik':
        return { ...p, available: Boolean(cfg.bridges.kodik.url) || (cfg.kodik.enabled && Boolean(cfg.kodik.token)) };
      case 'cvh':
      case 'aniboom':
        return { ...p, available: Boolean(cfg.bridges.multiplayer.url) };
      default:
        return p;
    }
  }).filter((p) => p.id !== 'demo' || cfg.demo.listed);
}

/**
 * Демо-потоки: тестовые MP4 из открытых CDN, работают из любой страны.
 * Раньше использовался Google gtv-videos-bucket — в 2026 Google закрыл
 * публичный доступ (AccessDenied). W3C media и Blender download тоже
 * начали отдавать 404. Оставлены три независимых источника с H.264 MP4,
 * которые проверены вручную: test-videos.co.uk, archive.org, filesamples.com.
 */
const DEMO_URLS = [
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
  'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
  'https://filesamples.com/samples/video/mp4/sample_640x360.mp4',
];

export function demoStream(slug: string, episode: number): string {
  const h = hashStr(`${slug}:${episode}`);
  return DEMO_URLS[h % DEMO_URLS.length];
}

/** Демо-окно опенинга, если провайдер не дал тайминги. */
export const INTRO_WINDOW: [number, number] = [8, 95];