import type { ReactElement } from 'react';

/**
 * Единый компонент структурированных данных (аудит-волна SEO-9, 01.10):
 * JSON-LD с экранированием '<' (защита от </script> в текстах, как в HomeJsonLd).
 * Используется хабами: /top, /genres, /genre/*, /collections, /collections/*.
 */
export function JsonLd({ data }: { data: unknown }): ReactElement {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

/** Хелпер: абсолютные URL для schema.org (metadataBase из layout не действует в JSON-LD). */
export function siteBase(url: string): string {
  return url.replace(/\/$/, '');
}

/** BreadcrumbList: Главная → …текущий уровень. */
export function breadcrumbsLd(base: string, trail: { name: string; href?: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${base}/` },
      ...trail.map((t, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: t.name,
        ...(t.href ? { item: `${base}${t.href}` } : {}),
      })),
    ],
  };
}

/** ItemList со ссылками и именами (для топов/жанров/подборок). */
export function itemListLd(items: { href: string; name: string }[], base: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${base}${it.href}`,
      name: it.name,
    })),
  };
}
