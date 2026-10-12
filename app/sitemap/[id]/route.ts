import { getProvidersConfig } from '@/lib/config/providers.config';
import { SITEMAP_IDS, buildSitemap, urlsetXml, xmlResponse } from '@/lib/sitemap';

/* Аудит 2026-10 (ТЗ 1.7.2): файлы sitemap, лимит 50 000 URL на файл.
 * 0 — статика и хабы, 1/2 — страницы тайтлов (каталог пополам), 3 — страницы серий
 * с подтверждённым источником. Подробности и причины — в lib/sitemap.ts. */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Props) {
  const { id: raw } = await params;
  const id = String(raw ?? '').replace(/\.xml$/i, '');
  if (!SITEMAP_IDS.includes(id as (typeof SITEMAP_IDS)[number])) {
    return new Response('not found', { status: 404 });
  }
  const base = getProvidersConfig().site.url;
  const entries = await buildSitemap(id, base);
  return xmlResponse(urlsetXml(entries));
}
