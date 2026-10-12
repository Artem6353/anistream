/* Смоук-тест маршрутов: npm run smoke (сервер должен быть запущен на :3000 или SMOKE_URL). */
const base = process.env.SMOKE_URL ?? 'http://localhost:3000';
/* [path, expected|allowed[]] */
const routes = [
  ['/', 200],
  ['/catalog', 200],
  ['/catalog?genre=action&sort=score', 200],
  ['/genres', 200],
  ['/top', 200],
  ['/profile/list', 200],
  ['/catalog?view=list&genre=action&sort=score', 200],
  ['/api/availability/sousou-no-frieren', 200],
  ['/api/titles?slugs=sousou-no-frieren,one-piece', 200],
  ['/genre/mecha', 200],
  /* ТЗ 2.2: пагинация и сортировки жанров — сегменты пути (не query), иначе маршрут
     становится динамическим и Vercel отдаёт его с cache-control: private, no-store. */
  ['/genre/mecha/pop-2', [200, 404]],
  ['/genre/unknown-genre', 404],
  ['/anime/sousou-no-frieren', 200],
  ['/anime/sousou-no-frieren/3', 200],
  ['/anime/nope', 404],
  ['/schedule', 200],
  ['/search?q=фри', 200],
  ['/profile/bookmarks', 200],
  ['/profile/history', 200],
  ['/profile/settings', 200],
  ['/api/search?q=клинок', 200],
  ['/api/schedule', 200],
  ['/sitemap.xml', 200],
  /* ТЗ 1.7.2: индекс + файлы sitemap (в Next 16 generateSitemaps+force-dynamic
     индекс не создавал, поэтому sitemap собран явными route-хендлерами). */
  ['/sitemap/0.xml', 200],
  ['/sitemap/1.xml', 200],
  ['/sitemap/2.xml', 200],
  ['/sitemap/3.xml', 200],
  ['/robots.txt', 200],
  ['/manifest.webmanifest', 200],
  ['/sw.js', 200],
  /* единая точка входа: registry сам резолвит все провайдеры (provider-параметра больше нет) */
  ['/api/providers/sousou-no-frieren/1', 200],
  ['/api/providers/sousou-no-frieren/12', 200],
  ['/api/providers/nope/1', 404],
  ['/404-probe', 404],
  /* ТЗ 1.5/1.7.4: разделы, которые раньше наследовали title/og главной */
  ['/feed', 200],
  ['/clubs', 200],
  ['/forum', 200],
  ['/quiz', 200],
  ['/messages', 200],
];

/* ТЗ 1.5.4: парсинг <meta> на типовых URL. Проверяем, что страница не наследует
   корневые og:title/og:url и что у страницы тайтла description не обрывается. */
const META_CHECKS = [
  /* canonical главной — «https://<host>» без завершающего слэша (так отдаёт Next). */
  { path: '/', titleIncludes: 'AniNova', canonical: '' },
  { path: '/schedule', titleIncludes: 'Расписание', canonical: '/schedule' },
  { path: '/anime/sousou-no-frieren', titleIncludes: 'Фрирен', canonical: '/anime/sousou-no-frieren' },
  { path: '/anime/sousou-no-frieren/3', titleIncludes: 'серия 3', canonical: '/anime/sousou-no-frieren/3' },
  { path: '/genre/mecha', titleIncludes: 'жанра Меха', canonical: '/genre/mecha' },
];

function metaOf(html, property) {
  const re = new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`);
  return html.match(re)?.[1] ?? null;
}
let failed = 0;
for (const [path, expected] of routes) {
  const res = await fetch(base + path);
  const ok = Array.isArray(expected) ? expected.includes(res.status) : res.status === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${res.status} (want ${Array.isArray(expected) ? expected.join('|') : expected}) ${path}`);
}

/* Задача 3 аудита: старые query-URL жанров должны редиректить (308) на сегменты пути
   и в итоге отдавать 200 с кэшем. Проверяем и редирект, и конечную страницу. */
console.log('\n--- редиректы жанров ---');
const REDIRECTS = [
  ['/genre/mecha?sort=pop&page=2', '/genre/mecha/pop-2'],
  ['/genre/mecha?sort=score', '/genre/mecha/score-1'],
  ['/genre/mecha?page=1', '/genre/mecha'],
  ['/genre/mecha?sort=bad', '/genre/mecha'],
  ['/genre/mecha?page=abc', '/genre/mecha'],
  ['/genre/mecha?page=0', '/genre/mecha'],
  ['/genre/mecha?sort=az&page=2&utm_source=smoke', '/genre/mecha/az-2'],
];
for (const [from, expected] of REDIRECTS) {
  const first = await fetch(base + from, { redirect: 'manual' });
  const location = (first.headers.get('location') || '').replace(base, '');
  const okStatus = first.status === 308 || first.status === 301;
  const okLocation = location === expected;
  const final = await fetch(base + from, { redirect: 'follow' });
  const cc = final.headers.get('cache-control') || '';
  const okFinal = final.status === 200 && cc.includes('s-maxage');
  const ok = okStatus && okLocation && okFinal;
  if (!ok) failed++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${from}\n       ${first.status} → ${location || '(нет location)'} (жду ${expected}), итог ${final.status}, cache-control «${cc.slice(0, 40)}»`,
  );
}
/* Чистый URL редиректиться не должен — иначе получим цепочку. */
{
  const clean = await fetch(base + '/genre/mecha', { redirect: 'manual' });
  const ok = clean.status === 200 && !clean.headers.get('location');
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} /genre/mecha без query → ${clean.status}, location=${clean.headers.get('location') || 'нет'}`);
}

console.log('\n--- meta-теги ---');
for (const check of META_CHECKS) {
  const res = await fetch(base + check.path);
  const html = await res.text();
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? '';
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? '';
  const ogUrl = metaOf(html, 'og:url') ?? '';
  const ogTitle = metaOf(html, 'og:title') ?? '';
  const description = metaOf(html, 'description') ?? '';

  const problems = [];
  if (res.status !== 200) problems.push(`status ${res.status}`);
  if (!title.includes(check.titleIncludes)) problems.push(`title не содержит «${check.titleIncludes}»: «${title.slice(0, 60)}»`);
  const canonicalPath = canonical.replace(/^https?:\/\/[^/]+/, '');
  if (canonicalPath !== check.canonical) problems.push(`canonical «${canonical || 'НЕТ'}» ≠ «…${check.canonical}»`);
  if (ogUrl && ogUrl.replace(/\/$/, '') !== canonical.replace(/\/$/, '')) problems.push(`og:url «${ogUrl}» ≠ canonical «${canonical}»`);
  if (ogTitle && ogTitle === 'AniNova — каталог аниме' && check.path !== '/') problems.push('og:title унаследован с главной');
  /* ТЗ 1.4: описание не должно обрываться посреди слова. */
  if (description && !/[.!?…]["»')\]]?$/.test(description.trim())) problems.push(`description обрывается: «…${description.slice(-40)}»`);

  if (problems.length) failed++;
  console.log(`${problems.length ? 'FAIL' : 'PASS'} ${check.path}${problems.length ? ' → ' + problems.join('; ') : ''}`);
}

console.log(failed ? `\n${failed} failures` : '\nAll routes OK');
process.exit(failed ? 1 : 0);
