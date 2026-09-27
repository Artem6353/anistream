/* Дедупликация каталога (ТЗ «Jikan», блок 6):
   1) дубликаты по malId → оставить один (приоритет AniList: source !== 'jikan');
   2) очень похожие названия (Левенштейн < 3) + одинаковый год → СПИСОК в stdout,
      без автоудаления (может быть ремейком);
   3) битые записи (нет постера ИЛИ нет названия) → удалить;
   4) попутно проставляет source:'anilist' там, где флага нет (миграция метки источника).
   Запуск: node scripts/dedup-catalog.mjs */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'lib/data/titles.json';
const titles = JSON.parse(readFileSync(P, 'utf8'));

/* 4) метка источника */
let stamped = 0;
for (const t of titles) {
  if (!t.source) { t.source = 'anilist'; stamped++; }
}

/* 1) дубликаты по malId */
const byMal = new Map();
for (const t of titles) {
  if (!t.malId) continue;
  const cur = byMal.get(t.malId);
  if (!cur) byMal.set(t.malId, t);
  else if (cur.source === 'jikan' && t.source !== 'jikan') byMal.set(t.malId, t); // AniList приоритетнее
}
const keepMal = new Set([...byMal.values()]);
const dupRemoved = titles.filter((t) => t.malId && !keepMal.has(t));
let kept = titles.filter((t) => !(t.malId && !keepMal.has(t)));

/* 3) битые данные */
const broken = kept.filter((t) => !t.poster || !t.ru || !t.romaji);
kept = kept.filter((t) => t.poster && t.ru && t.romaji);

/* 2) похожие названия + год → только отчёт */
const lev = (a, b) => {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) >= 3) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    let min = Infinity;
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      min = Math.min(min, d[i][j]);
    }
    if (min >= 3) return 3; // ранний выход
  }
  return d[m][n];
};
const normName = (t) => String(t.romaji || t.ru).toLowerCase().replace(/[^a-z0-9]+/g, '');
const byYear = new Map();
for (const t of kept) {
  const k = t.year;
  if (!byYear.has(k)) byYear.set(k, []);
  byYear.get(k).push(t);
}
const similar = [];
for (const list of byYear.values()) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = normName(list[i]), b = normName(list[j]);
      if (a === b) continue;
      if (lev(a, b) < 3) similar.push([list[i].slug, list[j].slug, list[i].year]);
    }
  }
}

writeFileSync(P, JSON.stringify(kept));
console.log(`source проставлен: ${stamped} · дубликатов по malId удалено: ${dupRemoved.length} · битых удалено: ${broken.length} · осталось: ${kept.length}`);
if (broken.length) console.log('битые:', broken.map((t) => t.slug).slice(0, 10).join(', '));
console.log(`похожих пар (Левенштейн <3, тот же год) — ТОЛЬКО ОТЧЁТ: ${similar.length}`);
for (const [a, b, y] of similar.slice(0, 15)) console.log(`  ~ ${a} ↔ ${b} (${y})`);
