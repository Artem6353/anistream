/* Отчёт: номер сезона в названии ≠ номеру сезона в slug/romaji (ТЗ 3.1.2).
 *
 * Пример из аудита: «Провожающая в последний путь Фрирен 2» встречается ДВАЖДЫ —
 * у `sousou-no-frieren-2nd-season` (2026) и у `sousou-no-frieren-3rd-season` (2027).
 * Shikimori для обоих отдаёт russian «…Фрирен 2», поэтому русское название третьего
 * сезона осталось от второго. Slug при этом корректен (он строится из romaji AniList),
 * то есть расходится именно название.
 *
 * Скрипт только ПЕЧАТАЕТ отчёт и пишет .cache/season-slug-mismatch.json. Названия
 * не правит: автоматы здесь ломают данные (нужно решение «2-й сезон» vs «3-й сезон»
 * по данным AniList relations), а после --fix-dupes дубли уже различаются годом.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const FILE = process.env.TITLES_FILE ?? 'lib/data/titles.json';
const titles = JSON.parse(readFileSync(FILE, 'utf8'));

const ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th' };
const slugSeason = (slug, romaji) => {
  const hay = `${slug} ${romaji ?? ''}`.toLowerCase();
  for (const [n, word] of Object.entries(ORDINAL)) {
    if (hay.includes(`${word}-season`) || hay.includes(`season-${n}`) || hay.includes(`part-${n}`)) return Number(n);
  }
  const m = hay.match(/\b(\d+)(?:st|nd|rd|th)\b/);
  return m ? Number(m[1]) : null;
};
const nameSeason = (ru) => {
  if (!ru) return null;
  const m = ru.match(/(?:^|[\s:—-])(\d{1,2})(?=[\s:—-]|$)/g);
  if (!m) return null;
  const last = m[m.length - 1].trim();
  const n = Number(last);
  return Number.isFinite(n) && n >= 2 && n <= 15 ? n : null;
};

const rows = [];
for (const t of titles) {
  const inSlug = slugSeason(t.slug, t.romaji);
  const inName = nameSeason(t.ru);
  if (inSlug === null || inName === null) continue;
  if (inSlug !== inName) rows.push({ slug: t.slug, ru: t.ru, romaji: t.romaji, year: t.year, seasonInSlug: inSlug, seasonInName: inName });
}

const dups = new Map();
for (const t of titles) {
  const key = (t.ru ?? '').replace(/\s*\(\d{4}\)$/, '');
  if (!dups.has(key)) dups.set(key, []);
  dups.get(key).push({ slug: t.slug, ru: t.ru, romaji: t.romaji, year: t.year });
}
const dupRows = [...dups.entries()].filter(([, v]) => v.length > 1).map(([name, items]) => ({ name, items }));

mkdirSync('.cache', { recursive: true });
const out = {
  generatedAt: new Date().toISOString(),
  totalTitles: titles.length,
  seasonMismatch: { count: rows.length, items: rows.slice(0, 200) },
  duplicateBaseNames: { count: dupRows.length, items: dupRows.slice(0, 200) },
};
writeFileSync('.cache/season-slug-mismatch.json', JSON.stringify(out, null, 2));

console.log(`всего тайтлов: ${titles.length}`);
console.log(`\n=== номер сезона в названии ≠ номеру в slug/romaji: ${rows.length} ===`);
for (const r of rows.slice(0, 25)) {
  console.log(`  ${r.slug}\n    ru: «${r.ru}» (сезон ${r.seasonInName}) · romaji: ${r.romaji} (сезон ${r.seasonInSlug}) · ${r.year}`);
}
if (rows.length > 25) console.log(`  … ещё ${rows.length - 25} — в .cache/season-slug-mismatch.json`);
console.log(`\n=== одинаковые базовые названия (без учёта года): ${dupRows.length} ===`);
for (const d of dupRows.slice(0, 15)) {
  console.log(`  «${d.name}» × ${d.items.length}: ${d.items.map((i) => `${i.year}/${i.slug}`).join(', ')}`);
}
if (dupRows.length > 15) console.log(`  … ещё ${dupRows.length - 15} — в .cache/season-slug-mismatch.json`);
console.log('\nотчёт: .cache/season-slug-mismatch.json');
