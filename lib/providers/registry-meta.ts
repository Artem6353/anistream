import { hashStr } from '../format';
import { getProvidersConfig } from '@/lib/config/providers.config';
import type { ProviderMeta } from './types';

/** Мета-часть реестра: доступна клиенту и серверу, без тяжёлых импортов. */

export const PROVIDER_IDS = ['demo', 'kodik', 'cvh', 'aniboom'] as const;

export const PROVIDERS: ProviderMeta[] = [
  { id: 'demo', label: 'AniNova Demo', hint: 'Публичные тестовые потоки, работают без ключей', available: true },
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

const STREAMS = [
  'BigBuckBunny',
  'ElephantsDream',
  'Sintel',
  'TearsOfSteel',
  'ForBiggerBlazes',
  'ForBiggerEscapes',
  'ForBiggerFun',
  'ForBiggerJoyrides',
  'ForBiggerMeltdowns',
  'SubaruOutbackOnStreetAndDirt',
  'VolkswagenGTIReview',
  'WeAreGoingOnBullrun',
];

const BASE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';

export function demoStream(slug: string, episode: number): string {
  const h = hashStr(`${slug}:${episode}`);
  return `${BASE}/${STREAMS[h % STREAMS.length]}.mp4`;
}

/** Демо-окно опенинга, если провайдер не дал тайминги. */
export const INTRO_WINDOW: [number, number] = [8, 95];
