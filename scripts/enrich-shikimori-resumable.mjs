/* Фоновое RU-обогащение Shikimori v2: параллельно, resumable, без повторных проверок.
   - CONCURRENCY (по умолч. 5) воркеров; бережно к rate-limit (5 rps): пауза 120 мс между запросами воркера;
   - после обработки тайтл помечается shikimoriChecked:true — повторные прогоны его пропускают
     (включая те, где Shikimori ничего не нашёл);
   - пишет файл каждые 40 тайтлов и в конце;
   - чистит BBCode/HTML из описаний, нормализует URL кадров.
   Запуск: npm run enrich   (можно прерывать и продолжать) */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'lib/data/titles.json';
const CONC = Number(process.env.CONCURRENCY ?? 5);
// --limit N (ТЗ блок B): обработать не более N тайтлов за запуск — для батчей в workflow
const LIMIT = Number((() => { const i = process.argv.indexOf('--limit'); if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]; const eq = process.argv.find((a) => a.startsWith('--limit=')); return eq ? eq.split('=')[1] : ''; })() || 0);
const titles = JSON.parse(readFileSync(P, 'utf8'));

const clean = (s) =>
  !s
    ? s
    : String(s)
        .replace(/\[(\/?)(character|anime|manga|spoiler|quote|url|img|b|i|u|s|code|left|center|right|size|color|noparse)[^\]]*\]/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&laquo;/g, '«')
        .replace(/&raquo;/g, '»')
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .replace(/&hellip;/g, '…')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

const UA = { 'User-Agent': process.env.SHIKIMORI_USER_AGENT ?? 'AniNova/2.0 (+http://localhost:3000)' };
const ANILIST_UA = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (AniNova catalog sync)' };

/** Дозаполнение персонажей (ТЗ блок 3): если у тайтла <6 персонажей — тянем из AniList.
    Запрос делается ТОЛЬКО для таких тайтлов (обычно их единицы), чтобы не жечь rate-limit. */
async function anilistCharacters(anilistId) {
  const q = {
    query: `query($id:Int){ Media(id:$id,type:ANIME){ characters(page:1,perPage:6,sort:ROLE){ edges{ role node{ id name{ full } image{ large } } } } } }`,
    variables: { id: anilistId },
  };
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: ANILIST_UA, body: JSON.stringify(q) });
      if (r.status === 429) { await sleep(5000 * (a + 1)); continue; }
      const j = await r.json();
      return (j?.data?.Media?.characters?.edges ?? []).map((e) => ({ name: e.node.name.full, img: e.node.image?.large ?? null, role: e.role }));
    } catch { await sleep(1500 * (a + 1)); }
  }
  return null;
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (const host of ['https://shikimori.io', 'https://shikimori.one']) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(host + url, { headers: UA });
        if (r.status === 429 || r.status === 503) {
          await sleep(1200 * (i + 1));
          continue;
        }
        if (!r.ok) break;
        return await r.json();
      } catch {
        await sleep(600);
      }
    }
  }
  return null;
}

let pending = titles.filter((t) => !t.shikimoriChecked);
if (LIMIT > 0) pending = pending.slice(0, LIMIT);
console.log(`обогащению подлежат: ${pending.length} из ${titles.length} (проверенные пропускаются)`);

let done = 0;
let enriched = 0;
const started = Date.now();
const queue = [...pending];

/** Jikan (api.jikan.moe) — персонажи, если Shikimori не нашёл тайтл (ТЗ блок 2). */
async function jikanGet(path) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch((process.env.JIKAN_BASE || 'https://api.jikan.moe/v4') + path, {
        headers: { Accept: 'application/json', 'User-Agent': 'AniNova-catalog-sync/1.0' },
        signal: AbortSignal.timeout(20000),
      });
      if (r.status === 429) { await sleep(5000 * (a + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1500 * (a + 1)); }
  }
  return null;
}

async function worker() {
  while (queue.length) {
    const t = queue.shift();
    if (t.shikimori && !t.shikimoriChecked) {
      t.shikimoriChecked = true; // уже обогащён ранее — не тратим запросы
      done++;
      continue;
    }
    // ТЗ блок 2: у Jikan-тайтлов (malId без anilist-происхождения) id Shikimori == id MAL —
    // пробуем прямую карточку /api/animes/{malId} вместо поиска по названию.
    if (!t.shikimori && t.malId) {
      const direct = await getJson(`/api/animes/${t.malId}`);
      if (direct?.id) {
        const desc = clean(direct.description)?.slice(0, 900);
        t.shikimori = {
          id: direct.id,
          ru: direct.russian || null,
          description: desc || null,
          score: Number(direct.score || 0) || 0,
        };
        if (direct.russian) t.ru = direct.russian;
        if (desc) t.description = desc;
        const shots = (direct.screenshots ?? []).map((sc) => sc?.original).filter(Boolean);
        if (shots.length) t.screenshots = shots.slice(0, 12).map((u) => (u.startsWith('http') ? u : u.startsWith('//') ? 'https:' + u : 'https://shikimori.io' + u));
        enriched++;
        await sleep(120);
      }
    }
    // ТЗ блок 2: для Jikan-тайтлов fuzzy-поиск по названию отключён — только прямой malId-лукup;
    // «не найден» → оставляем как есть (метаданные Jikan), без чужих карточек.
    const found = !t.shikimori && t.metaSource !== 'jikan' ? await getJson(`/api/animes?limit=3&search=${encodeURIComponent(t.romaji)}`) : null;
    if (Array.isArray(found) && found.length) {
      const target = norm(t.romaji);
      const best =
        found.find((f) => norm(f.name) === target) ??
        found.find((f) => target.startsWith(norm(f.name).slice(0, 12))) ??
        found[0];
      const full = await getJson(`/api/animes/${best.id}`);
      const desc = clean(full?.description)?.slice(0, 900);
      t.shikimori = {
        id: best.id,
        ru: full?.russian || best.russian || null,
        description: desc || null,
        score: Number(full?.score || best.score || 0) || 0,
      };
      if (t.shikimori.ru) t.ru = t.shikimori.ru;
      if (desc) t.description = desc;
      const shots = (full?.screenshots ?? []).map((sc) => sc?.original).filter(Boolean);
      if (shots.length) t.screenshots = shots.slice(0, 12).map((u) => (u.startsWith('http') ? u : u.startsWith('//') ? 'https:' + u : 'https://shikimori.io' + u));
      enriched++;
    }
    if ((t.characters?.length ?? 0) < 6) {
      // ТЗ блок 2: сначала Jikan (для malId-тайтлов), затем AniList (для anilist-тайтлов)
      let chars = null;
      if (t.malId) {
        const cj = await jikanGet(`/anime/${t.malId}/characters`);
        const list = (cj?.data ?? []).slice(0, 6);
        if (list.length) chars = list.map((c) => ({ name: c.character?.name ?? '', img: c.character?.images?.jpg?.image_url ?? null, role: c.role ?? 'Character' }));
        await sleep(400); // rate-limit Jikan 3 req/s
      }
      if (!chars && t.anilistId > 0) chars = await anilistCharacters(t.anilistId);
      if (chars?.length) t.characters = chars;
      await sleep(300); // бережно к rate-limit AniList
    }
    t.shikimoriChecked = true;
    done++;
    if (done % 20 === 0) {
      writeFileSync(P, JSON.stringify(titles));
      const sec = (Date.now() - started) / 1000;
      const eta = ((sec / done) * (queue.length)).toFixed(0);
      process.stdout.write(`\r${done}/${pending.length} · обогащено ${enriched} · ETA ${eta} c   `);
    }
    await sleep(120);
  }
}

await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(P, JSON.stringify(titles));
console.log('');
console.log(`готово за ${((Date.now() - started) / 1000).toFixed(0)} c: обработано ${done}, обогащено ${enriched}`);
