/* Блок 2 (ТЗ «23 блока»): удаление хентай-тайтлов из каталога — политика 18+.
   1) удаляет тайтлы с жанром hentai/хентай;
   2) чистит ссылки на них из relations остальных тайтлов;
   3) бэкап в backups/titles.pre-hentai-<date>.json (backups/ в .gitignore);
   4) жанр hentai исчезает из /genres и фильтра каталога автоматически
      (они строятся из titles.json);
   5) прямые ссылки /anime/<slug> становятся 404 (каталог-драйвен роут).
   Запуск: node scripts/remove-hentai.mjs */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';

const FILE = 'lib/data/titles.json';
const stamp = new Date().toISOString().slice(0, 10);
const isHentai = (t) => (t.genres ?? []).some((g) => /hentai|хентай/i.test(g));

const titles = JSON.parse(readFileSync(FILE, 'utf8'));
const drop = new Set(titles.filter(isHentai).map((t) => t.anilistId));
if (!drop.size) {
  console.log('хентай-тайтлов не найдено — делать нечего');
  process.exit(0);
}

mkdirSync('backups', { recursive: true });
const backup = `backups/titles.pre-hentai-${stamp}.json`;
copyFileSync(FILE, backup);

const kept = titles.filter((t) => !drop.has(t.anilistId));
let relCleaned = 0;
for (const t of kept) {
  if (t.relations?.length) {
    const before = t.relations.length;
    t.relations = t.relations.filter((r) => !drop.has(r.id));
    relCleaned += before - t.relations.length;
  }
}
writeFileSync(FILE, JSON.stringify(kept));
console.log(`удалено хентай-тайтлов: ${drop.size} · осталось: ${kept.length} · ссылок в relations вычищено: ${relCleaned}`);
console.log(`бэкап: ${backup}`);
