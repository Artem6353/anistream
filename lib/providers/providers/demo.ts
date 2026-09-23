import type { EpisodeSource, ProviderContext } from '../types';
import { demoStream, INTRO_WINDOW } from '../registry-meta';

/** Демо-источник: публичные тестовые MP4, работает без bridge и токенов. */
export function demoSources(ctx: ProviderContext): EpisodeSource[] {
  return [
    {
      id: 'demo:720',
      label: 'Тест-поток (оригинал)',
      providerId: 'demo',
      providerName: 'AniStream Demo',
      kind: 'file',
      files: [{ quality: '720', url: demoStream(ctx.slug, ctx.episode), type: 'mp4' }],
      voice: 'unknown',
    },
  ];
}

export const DEMO_SKIP = { intro: INTRO_WINDOW };
