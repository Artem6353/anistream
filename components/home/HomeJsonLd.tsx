import { getProvidersConfig } from '@/lib/config/providers.config';
import { FAQ_ITEMS } from './SeoIntro';

/** S3.2 (аудит 28.09, SuperSEO schema 50): JSON-LD главной страницы —
 *  WebSite+SearchAction (поиск по каталогу), CollectionPage+ItemList (рельса
 *  «Сейчас популярно») и FAQPage (из FAQ_ITEMS SeoIntro — контент 1:1).
 *  Рендерится на сервере тремя отдельными <script type="application/ld+json">. */

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify экранирует </script> небезопасно только при ручных кавычках;
      // значения из каталога/FAQ не содержат «</script>», но подстрахуемся заменой.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export function HomeJsonLd({ popular }: { popular: { slug: string; ru: string }[] }) {
  const site = getProvidersConfig().site.url.replace(/\/+$/, '');
  const description =
    'Каталог аниме с русскими описаниями: подборки, жанры, живое расписание выхода серий, локальная история просмотров и плеер с автопереходом.';

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AniNova',
    alternateName: 'AniNova — каталог аниме',
    url: `${site}/`,
    description,
    inLanguage: 'ru',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${site}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'AniNova — каталог аниме: онгоинги, расписание выхода серий и плеер',
    url: `${site}/`,
    description,
    inLanguage: 'ru',
    isPartOf: { '@type': 'WebSite', name: 'AniNova', url: `${site}/` },
    mainEntity: {
      '@type': 'ItemList',
      name: 'Сейчас популярно',
      numberOfItems: popular.length,
      itemListElement: popular.map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${site}/anime/${t.slug}`,
        name: t.ru,
      })),
    },
  };

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'ru',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return (
    <>
      <JsonLd data={website} />
      <JsonLd data={collection} />
      <JsonLd data={faq} />
    </>
  );
}
