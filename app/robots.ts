import type { MetadataRoute } from 'next';
import { getProvidersConfig } from '@/lib/config/providers.config';

export default function robots(): MetadataRoute.Robots {
  const site = getProvidersConfig().site.url;
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
    /* Аудит 2026-10 (ТЗ 1.7.2/1.7.3): индекс + все четыре файла sitemap.
       Проверка robots.txt на проде: YandexBot и остальные поисковики НЕ заблокированы
       (единственная группа — `User-Agent: *` с Allow /), поэтому пункт ТЗ про
       «Allow только для Googlebot» не воспроизводится: точечные Allow для /api/titles,
       /api/schedule и /api/social/reviews лишь перебивают общий Disallow /api/
       для read-only роутов, которыми Googlebot-рендер догружает рельсы главной. */
    sitemap: [
      `${site}/sitemap.xml`,
      `${site}/sitemap/0.xml`,
      `${site}/sitemap/1.xml`,
      `${site}/sitemap/2.xml`,
      `${site}/sitemap/3.xml`,
    ],
  };
}
