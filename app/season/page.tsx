import type { Metadata } from 'next';
import Link from 'next/link';
import { seasonCombos, seasonTitle } from '@/lib/editorial';
import { JsonLd, breadcrumbsLd, itemListLd } from '@/components/system/JsonLd';
import { getProvidersConfig } from '@/lib/config/providers.config';

export const revalidate = 3600;

/* SEO-9 (01.10): хаб сезонов — индекс сезон-хабов («аниме сезона весна 2026» —
   частотный запрос с ясным интентом; раньше сезонных страниц не было вовсе). */
export const metadata: Metadata = {
  title: 'Сезоны аниме — все сезонные подборки по годам',
  description: 'Сезонные хабы аниме: зима, весна, лето и осень по годам — списки тайтлов сезона с рейтингом, статусом и графиком выхода серий.',
  alternates: { canonical: '/season' },
  openGraph: { type: 'website', url: '/season', locale: 'ru_RU', siteName: 'AniNova' },
};

export default function SeasonIndexPage() {
  const base = getProvidersConfig().site.url;
  const combos = seasonCombos();
  const byYear = new Map<number, typeof combos>();
  for (const c of combos) {
    const list = byYear.get(c.year) ?? [];
    list.push(c);
    byYear.set(c.year, list);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  return (
    <>
      <JsonLd data={breadcrumbsLd(base, [{ name: 'Сезоны аниме' }])} />
      <JsonLd data={itemListLd(combos.slice(0, 60).map((c) => ({ href: `/season/${c.slug}`, name: `Аниме ${seasonTitle(c.season, c.year)}` })), base)} />
      <div className="container">
        <nav className="crumbs" aria-label="Хлебные крошки">
          <Link href="/">Главная</Link>
          <span>/</span>
          <span>Сезоны</span>
        </nav>
        <header className="page-head">
          <h1>Сезоны аниме</h1>
          <p>Каждый сезон — отдельная страница со списком тайтлов, редакторской сводкой и графиком выхода.</p>
        </header>
        <div className="season-years">
          {years.map((y) => (
            <section key={y} className="season-year">
              <h2 className="section-title">{y}</h2>
              <div className="chips">
                {byYear
                  .get(y)!
                  .map((c) => (
                    <Link key={c.slug} className="chip" href={`/season/${c.slug}`}>
                      {seasonTitle(c.season, c.year)} · {c.count}
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
