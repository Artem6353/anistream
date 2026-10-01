import type { MetadataRoute } from 'next';
import { allTitles, genreStats } from '@/lib/catalog';
import { COLLECTIONS } from '@/lib/collections';
import { getProvidersConfig } from '@/lib/config/providers.config';

/* Аудит SEO-9 (01.10): sitemap покрывал только статику + тайтлы — хабы
   /top, /genre/*, /collections/* жили без sitemap-сигнала. Добавлены;
   для онгоингов — РЕАЛЬНЫЙ lastmod по последней дате эфира (airing),
   вместо удалённого ранее фейкового «now для всех». */
export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getProvidersConfig().site.url;
  const staticRoutes: MetadataRoute.Sitemap = ['/', '/catalog', '/genres', '/schedule', '/top', '/collections'].map((href) => ({
    url: `${base}${href}`,
    changeFrequency: 'daily',
    priority: href === '/' ? 1 : 0.8,
  }));
  const hubs: MetadataRoute.Sitemap = [
    ...genreStats().map((g) => ({
      url: `${base}/genre/${g.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...COLLECTIONS.map((c) => ({
      url: `${base}/collections/${c.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
  const titles: MetadataRoute.Sitemap = allTitles().map((t) => {
    const lastAir = (t.airing ?? []).reduce((m, a) => Math.max(m, a.at ?? 0), 0);
    return {
      url: `${base}/anime/${t.slug}`,
      changeFrequency: t.status === 'ongoing' ? ('daily' as const) : ('monthly' as const),
      priority: 0.6,
      /* Реальная свежесть: последний эфир онгоинга. У finished lastmod не ставим —
         фейковые даты Google игнорирует и перестаёт доверять lastmod. */
      ...(lastAir ? { lastModified: new Date(lastAir) } : {}), // airing.at уже в ms
    };
  });
  return [...staticRoutes, ...hubs, ...titles];
}
