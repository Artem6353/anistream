import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { imgLoader, imgProxyUrl } from '@/lib/img';

/* Регрессия: на Netlify ключ CDN-кэша для ответов Next.js не включает query, если
   ответ не просит об этом через Netlify-Vary. Без заголовка /img?url=… отдавал всем
   тайтлам первый закэшированный постер («Ван-Пис»), а /api/titles — один набор. */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

describe('Netlify CDN cache key by query', () => {
  it.each(['app/img/route.ts', 'app/api/titles/route.ts', 'app/api/reco/route.ts'])('%s varies on query', (file) => {
    expect(read(file)).toMatch(/'Netlify-Vary': 'query'/);
  });

  it('image proxy URLs carry a cache-busting version', () => {
    const src = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx1-x.jpg';
    expect(new URL(imgProxyUrl(src, 200)!, 'http://x').searchParams.get('v')).toBe('2');
    expect(new URL(imgLoader({ src, width: 200 }), 'http://x').searchParams.get('v')).toBe('2');
  });
});
