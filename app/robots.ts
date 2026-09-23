import type { MetadataRoute } from 'next';
import { getProvidersConfig } from '@/lib/config/providers.config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/profile/', '/admin'] },
    sitemap: `${getProvidersConfig().site.url}/sitemap.xml`,
  };
}
