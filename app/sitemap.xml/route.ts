import { getProvidersConfig } from '@/lib/config/providers.config';
import { sitemapIndexXml, xmlResponse } from '@/lib/sitemap';

/* Аудит 2026-10 (ТЗ 1.7.2): индекс sitemap.
 * В Next 16.3.8 файл app/sitemap.ts с generateSitemaps() индекс /sitemap.xml
 * не создавал вовсе (404), а robots.txt и Google Search Console ссылаются именно
 * на него. Поэтому индекс — явный route-хендлер.
 *
 * Не собираем на билде (dynamic): четыре файла по ~4000 URL роняли сборку по памяти
 * в песочнице (1 ГБ RAM, heap 700 МБ). Ответ кэшируется краем через s-maxage. */
export const dynamic = 'force-dynamic';

export async function GET() {
  const base = getProvidersConfig().site.url;
  return xmlResponse(sitemapIndexXml(base));
}
