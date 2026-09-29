import type { MetadataRoute } from 'next';
import { allTitles } from '@/lib/catalog';
import { getProvidersConfig } from '@/lib/config/providers.config';

/* Аудит 30.09 (SEO-5): перегенерация не чаще раза в час (раньше — на каждый
   запрос краулера); /search убран (пустая страница-дубль каталога, canonical
   всё равно на чистый /search); lastModified=now для ВСЕХ url удалён — фейковую
   свежесть Google игнорирует и перестаёт доверять lastmod. */
export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getProvidersConfig().site.url;
  const staticRoutes: MetadataRoute.Sitemap = ['/', '/catalog', '/genres', '/schedule'].map((href) => ({
    url: `${base}${href}`,
    changeFrequency: 'daily',
    priority: href === '/' ? 1 : 0.8,
  }));
  const titles: MetadataRoute.Sitemap = allTitles().map((t) => ({
    url: `${base}/anime/${t.slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));
  return [...staticRoutes, ...titles];
}
