import { allTitles, genreStats } from '@/lib/catalog';
import { COLLECTIONS } from '@/lib/collections';
import { seasonCombos } from '@/lib/editorial';
import { GENRE_PER_PAGE, genreHref, genreSlugs } from '@/lib/genre-pages';
import { episodeSourcesDbConfigured, titleHasSources } from '@/lib/episode-sources';

/**
 * Сборка sitemap (аудит 2026-10, ТЗ 1.7.2).
 *
 * Почему route-хендлеры, а не app/sitemap.ts: в Next 16.3.8 комбинация
 * `generateSitemaps()` + `dynamic = 'force-dynamic'` не создаёт индекс
 * /sitemap.xml вовсе (404), а без force-dynamic сборка четырёх файлов
 * по ~4000 URL падала по памяти («build worker exited with signal SIGKILL»).
 * Дополнительно при force-dynamic все четыре /sitemap/N.xml отдавались ПУСТЫМ
 * urlset, хотя та же функция вне сборки возвращала 326/4009/4008/0 записей —
 * то есть id в неё не доезжал. Роботы при этом ссылаются на /sitemap.xml,
 * поэтому индекс обязан работать: делаем его явным route-хендлером.
 *
 * Файлы:
 *   /sitemap.xml   — индекс (со lastmod);
 *   /sitemap/0.xml — статика и хабы: жанры (+ первые 5 страниц пагинации), подборки, сезоны;
 *   /sitemap/1.xml — первая половина страниц тайтлов;
 *   /sitemap/2.xml — вторая половина страниц тайтлов;
 *   /sitemap/3.xml — страницы серий, у которых есть подтверждённый источник
 *                    (только при настроенной БД: файловый fallback читает кэш
 *                    providers-resolve-cache.json на 98 МБ и роняет процесс по OOM).
 *
 * Разделы без контента (лента/клубы/форум) не попадают в sitemap: они закрыты
 * noindex через lib/section-index.ts, пока записей меньше порога.
 */

const XML_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
} as const;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export type Freq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: Freq;
  priority?: number;
}

export const SITEMAP_IDS = ['0', '1', '2', '3'] as const;
export type SitemapId = (typeof SITEMAP_IDS)[number];

/** Статические разделы, которые индексируются всегда. */
const STATIC_ROUTES: { href: string; freq: Freq; priority: number }[] = [
  { href: '/', freq: 'daily', priority: 1 },
  { href: '/catalog', freq: 'daily', priority: 0.8 },
  { href: '/genres', freq: 'daily', priority: 0.8 },
  { href: '/schedule', freq: 'daily', priority: 0.8 },
  { href: '/top', freq: 'daily', priority: 0.8 },
  { href: '/collections', freq: 'daily', priority: 0.8 },
  { href: '/season', freq: 'daily', priority: 0.8 },
];

/** Сколько страниц пагинации жанра отправляем в sitemap (хвосты дорисуются on-demand). */
const GENRE_SITEMAP_PAGES = 5;

function visibleTitles() {
  return allTitles().filter((t) => !t.hidden);
}

function hubEntries(base: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  /* genreStats() сканирует весь каталог — считаем один раз, а не в цикле по жанрам. */
  const counts = new Map(genreStats().map((g) => [g.slug, g.count]));
  for (const slug of genreSlugs()) {
    const pages = Math.max(1, Math.ceil((counts.get(slug) ?? 0) / GENRE_PER_PAGE));
    out.push({ url: `${base}/genre/${slug}`, changeFrequency: 'weekly', priority: 0.7 });
    for (let p = 2; p <= Math.min(pages, GENRE_SITEMAP_PAGES); p++) {
      out.push({ url: `${base}${genreHref(slug, 'pop', p)}`, changeFrequency: 'weekly', priority: 0.5 });
    }
  }
  for (const c of COLLECTIONS) {
    out.push({ url: `${base}/collections/${c.slug}`, changeFrequency: 'weekly', priority: 0.6 });
  }
  for (const s of seasonCombos()) {
    out.push({ url: `${base}/season/${s.slug}`, changeFrequency: 'weekly', priority: 0.7 });
  }
  return out;
}

function titleEntries(base: string, titles: ReturnType<typeof visibleTitles>): SitemapEntry[] {
  return titles.map((t) => {
    const lastAir = (t.airing ?? []).reduce((m, a) => Math.max(m, a.at ?? 0), 0);
    return {
      url: `${base}/anime/${t.slug}`,
      changeFrequency: t.status === 'ongoing' ? ('daily' as Freq) : ('monthly' as Freq),
      priority: 0.6,
      /* Реальная свежесть: последний эфир онгоинга. У finished lastmod не ставим —
         на выдуманные даты Google перестаёт доверять lastmod. */
      ...(lastAir ? { lastModified: new Date(lastAir) } : {}),
    };
  });
}

async function episodeEntries(base: string): Promise<SitemapEntry[]> {
  if (!episodeSourcesDbConfigured()) return [];
  const limit = Number(process.env.SITEMAP_EPISODE_TITLES ?? 500);
  const candidates = visibleTitles()
    .filter((t) => t.status !== 'upcoming')
    .sort((a, b) => b.favourites - a.favourites)
    .slice(0, limit);
  /* Параллельно и заранее: последовательный обход 500 тайтлов — это минуты. */
  const verdicts = await Promise.all(candidates.map((t) => titleHasSources(t)));
  const out: SitemapEntry[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (!verdicts[i]) continue;
    const t = candidates[i];
    const count = t.episodes && t.episodes > 0 ? Math.min(t.episodes, 50) : 0;
    for (let ep = 1; ep <= count; ep++) {
      out.push({ url: `${base}/anime/${t.slug}/${ep}`, changeFrequency: 'weekly', priority: 0.4 });
    }
  }
  return out;
}

/** Содержимое одного файла sitemap. */
export async function buildSitemap(id: string, base: string): Promise<SitemapEntry[]> {
  if (id === '0') {
    return [...STATIC_ROUTES.map((r) => ({ url: `${base}${r.href}`, changeFrequency: r.freq, priority: r.priority })), ...hubEntries(base)];
  }
  const visible = visibleTitles();
  const half = Math.ceil(visible.length / 2);
  if (id === '1') return titleEntries(base, visible.slice(0, half));
  if (id === '2') return titleEntries(base, visible.slice(half));
  if (id === '3') return episodeEntries(base);
  return [];
}

export function urlsetXml(entries: SitemapEntry[]): string {
  const body = entries
    .map((e) => {
      const parts = [`    <loc>${esc(e.url)}</loc>`];
      if (e.lastModified) parts.push(`    <lastmod>${e.lastModified.toISOString()}</lastmod>`);
      if (e.changeFrequency) parts.push(`    <changefreq>${e.changeFrequency}</changefreq>`);
      if (e.priority !== undefined) parts.push(`    <priority>${e.priority}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function sitemapIndexXml(base: string): string {
  const now = new Date().toISOString();
  const body = SITEMAP_IDS.map(
    (id) =>
      `  <sitemap>\n    <loc>${esc(`${base}/sitemap/${id}.xml`)}</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export function xmlResponse(body: string): Response {
  return new Response(body, { headers: { ...XML_HEADERS } });
}
