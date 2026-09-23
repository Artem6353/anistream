import type { MetadataRoute } from 'next';
import { allTitles } from '@/lib/catalog';
import { getProvidersConfig } from '@/lib/config/providers.config';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getProvidersConfig().site.url;
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = ['/', '/catalog', '/genres', '/schedule', '/search'].map((href) => ({
    url: `${base}${href}`,
    changeFrequency: 'daily',
    priority: href === '/' ? 1 : 0.8,
  }));
  const titles: MetadataRoute.Sitemap = allTitles().map((t) => ({
    url: `${base}/anime/${t.slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
    lastModified: now,
  }));
  return [...staticRoutes, ...titles];
}
