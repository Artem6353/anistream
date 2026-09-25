/* Обогащение датасета данными Shikimori: id, русское имя, RU-описание.
   Запуск: node scripts/refresh-shikimori.mjs  (нужна сеть, ~1 мин). */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, '../lib/data/titles.json');
const titles = JSON.parse(readFileSync(path, 'utf8'));

const UA = { 'User-Agent': 'AniNova catalog (next.js; educational)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (const host of ['https://shikimori.io', 'https://shikimori.one']) {
    try {
      const res = await fetch(host + url, { headers: UA });
      if (!res.ok) continue;
      return await res.json();
    } catch {}
  }
  return null;
}

function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

let done = 0;
for (const t of titles) {
  try {
    const found = await getJson(`/api/animes?limit=3&search=${encodeURIComponent(t.romaji)}`);
    if (!Array.isArray(found) || !found.length) {
      console.log('— no match:', t.slug);
      continue;
    }
    const target = norm(t.romaji);
    const best =
      found.find((f) => norm(f.name) === target) ??
      found.find((f) => target.startsWith(norm(f.name).slice(0, 12))) ??
      found[0];
    const full = await getJson(`/api/animes/${best.id}`);
    const desc = htmlToText(full?.description).slice(0, 900);
    t.shikimori = {
      id: best.id,
      ru: full?.russian || best.russian || null,
      description: desc || null,
      score: full?.score ?? best.score ?? 0,
    };
    done++;
    console.log(`+ ${t.slug} → shikimori ${best.id} (${t.shikimori.ru ?? '-'})`);
  } catch (e) {
    console.log('! error', t.slug, e.message);
  }
  await sleep(220);
}

writeFileSync(path, JSON.stringify(titles, null, 1));
console.log(`\nenriched ${done}/${titles.length}`);
