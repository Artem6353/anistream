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
  ['/robots.txt', 200],
  ['/manifest.webmanifest', 200],
  ['/sw.js', 200],
  /* единая точка входа: registry сам резолвит все провайдеры (provider-параметра больше нет) */
  ['/api/providers/sousou-no-frieren/1', 200],
  ['/api/providers/sousou-no-frieren/12', 200],
  ['/api/providers/nope/1', 404],
  ['/404-probe', 404],
];
let failed = 0;
for (const [path, expected] of routes) {
  const res = await fetch(base + path);
  const ok = Array.isArray(expected) ? expected.includes(res.status) : res.status === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${res.status} (want ${Array.isArray(expected) ? expected.join('|') : expected}) ${path}`);
}
console.log(failed ? `\n${failed} failures` : '\nAll routes OK');
process.exit(failed ? 1 : 0);
