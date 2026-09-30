import type { MetadataRoute } from 'next';
import { getProvidersConfig } from '@/lib/config/providers.config';

export default function robots(): MetadataRoute.Robots {
  return {
    /* Аудит 30.09 (P2-4): Googlebot-рендер догружает ленивые рельсы главной
       клиентскими fetch /api/titles и /api/schedule — полный Disallow /api/
       оставлял их пустыми в отрендеренной копии (6 XHR blocked в GSC).
       Точечный Allow только для этих read-only ISR-роутов; остальные /api/*
       (POST-поверхность, персональные данные) закрыты как прежде. */
    rules: {
      userAgent: '*',
      allow: [
        '/',
        /* read-only роуты, которыми Googlebot-рендер догружает ВИДИМЫй контент:
           ленивые рельсы главной (/api/titles), расписание, секции отзывов.
           По стандарту robots.txt побеждает наиболее специфичный паттерн,
           поэтому эти Allow перебивают общий Disallow /api/ для своих префиксов. */
        '/api/titles',
        '/api/schedule',
        '/api/social/reviews',
      ],
      disallow: ['/api/', '/profile/', '/reviewer/', '/admin'],
    },
    sitemap: `${getProvidersConfig().site.url}/sitemap.xml`,
  };
}
