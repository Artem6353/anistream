/* Добор каталога через Jikan API (MyAnimeList) — ТЗ «Jikan», блок 1.
   AniList исчерпан (потолок ~8000 при гейтах), Jikan даёт 25 000+ аниме без API-ключа.

   Схема:
     1) GET /genres/anime — актуальные mal_id жанров;
     2) обход жанр × год (2024 → 2000): GET /anime?genres=&start_date=&end_date=
        &order_by=popularity&sort=desc&page=N&limit=25&sfw=true;
     3) sfw=true исключает 18+; гейты: score >= 6.0, members >= 100;
     4) дедуп: по malId существующих + по «нормализованное имя + год»;
     5) формат записи совместим с titles.json; anilistId = -malId (синтетический
        уникальный числовой id: null сломал бы Map<anilistId, Title> в lib/catalog.ts
        и scripts/expand-catalog.mjs — все Jikan-тайтлы схлопнулись бы в один ключ);
     6) rate-limit: пауза 400 мс между запросами (лимит Jikan 3 req/s), retry 429 ×3 backoff;
     7) resume: .cache/jikan-fetch-progress.json (жанр/год/страница);
     8) квота MAX_NEW=3000 или --limit N; прогресс-лог постранично;
     9) слаги из ромадзи, коллизии → суффикс -mal{id}; существующие слаги не трогаются.
   Запуск: node scripts/fetch-jikan.mjs [--limit N] [--reset] */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const BASE = process.env.JIKAN_BASE || 'https://api.jikan.moe/v4'; // JIKAN_BASE — для офлайн-тестов на моке
const P = 'lib/data/titles.json';
const PROGRESS = '.cache/jikan-fetch-progress.json';
const ARGS = process.argv.slice(2);
const li = ARGS.indexOf('--limit');
const LIMIT = Number((li >= 0 && ARGS[li + 1] ? ARGS[li + 1] : (ARGS.find((a) => a.startsWith('--limit=')) ?? '').split('=')[1]) || 0);
const MAX_NEW = LIMIT || Number(process.env.MAX_NEW || 3000);
const SLEEP_MS = Number(process.env.JIKAN_SLEEP_MS ?? 400);
const YEAR_FROM = 2024;
const YEAR_TO = 2000;
const GENRE_ORDER = [
  'Action', 'Comedy', 'Drama', 'Fantasy', 'Romance', 'Slice of Life', 'Sci-Fi', 'Adventure',
  'Mystery', 'Supernatural', 'Sports', 'Psychological', 'Suspense', 'Thriller', 'Horror',
  'Music', 'Gourmet', 'Avant Garde', 'Award Winning', 'Seinen', 'Shoujo', 'Shounen', 'Josei', 'Kids',
];
const BAD_GENRES = new Set(['hentai', 'erotica', 'ecchi']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const clean = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[(\/?)([^[\]]+)\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const slugify = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null;

async function jget(path) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(BASE + path, {
        headers: { Accept: 'application/json', 'User-Agent': 'AniNova-catalog-sync/1.0 (contact: admin@anistream.local)' },
        signal: AbortSignal.timeout(20000),
      });
      if (r.status === 429) {
        const wait = Number(r.headers.get('retry-after')) || 5;
        await sleep(wait * 1000 * (a + 1));
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(1500 * (a + 1));
    }
  }
  return null;
}

const titles = JSON.parse(readFileSync(P, 'utf8'));
const haveMal = new Set(titles.map((t) => t.malId).filter(Boolean));
const haveNameYear = new Set(titles.map((t) => `${norm(t.ru || t.romaji)}:${t.year}`));
const usedSlugs = new Set(titles.map((t) => t.slug));
const added = [];
let scanned = 0;

let resume = { gi: 0, year: YEAR_FROM, page: 1 };
if (ARGS.includes('--reset') && existsSync(PROGRESS)) {
  writeFileSync(PROGRESS, JSON.stringify({}));
  console.log('прогресс сброшен (--reset)');
} else if (existsSync(PROGRESS)) {
  try {
    const p = JSON.parse(readFileSync(PROGRESS, 'utf8'));
    if (p && typeof p.gi === 'number') resume = { gi: p.gi ?? 0, year: p.year ?? YEAR_FROM, page: p.page ?? 1 };
  } catch {}
}

function saveProgress(gi, year, page) {
  mkdirSync('.cache', { recursive: true });
  writeFileSync(PROGRESS, JSON.stringify({ gi, year, page, added: added.length, at: Date.now() }));
}
function saveTitles() {
  writeFileSync(P, JSON.stringify([...titles, ...added].sort((a, b) => b.favourites - a.favourites)));
}

const gj = await jget('/genres/anime');
const allGenres = (gj?.data ?? []).filter((g) => g.type === 'anime' && !['Hentai', 'Erotica'].includes(g.name));
const genres = [
  ...GENRE_ORDER.map((n) => allGenres.find((g) => g.name === n)).filter(Boolean),
  ...allGenres.filter((g) => !GENRE_ORDER.includes(g.name)),
];
console.log(`жанров: ${genres.length} · годы ${YEAR_FROM}→${YEAR_TO} · квота MAX_NEW=${MAX_NEW} · resume: жанр#${resume.gi} ${resume.year} стр${resume.page}`);

const capReached = () => added.length >= MAX_NEW;
let sinceSave = 0;

outer: for (let gi = resume.gi; gi < genres.length; gi++) {
  const g = genres[gi];
  const yearStart = gi === resume.gi ? resume.year : YEAR_FROM;
  for (let year = yearStart; year >= YEAR_TO; year--) {
    const pageStart = gi === resume.gi && year === resume.year ? resume.page : 1;
    let lastPage = 15;
    for (let page = pageStart; page <= lastPage; page++) {
      if (capReached()) break outer;
      const q = `/anime?genres=${g.mal_id}&start_date=${year}-01-01&end_date=${year}-12-31&order_by=popularity&sort=desc&page=${page}&limit=25&sfw=true`;
      const j = await jget(q);
      const data = j?.data ?? [];
      if (j?.pagination?.last_visible_page) lastPage = Math.min(lastPage, j.pagination.last_visible_page);
      if (!data.length) break;
      scanned += data.length;
      let newOnPage = 0;
      for (const m of data) {
        if (capReached()) break outer;
        if (!m?.mal_id || haveMal.has(m.mal_id)) continue;
        if ((m.score ?? 0) < 6.0 || (m.members ?? 0) < 100) continue;
        const yearM = m.year ?? m.aired?.prop?.from?.year ?? 0;
        const nameKey = `${norm(m.title_japanese || m.title)}:${yearM}`;
        if (haveNameYear.has(nameKey)) continue;
        let slug = slugify(m.title_japanese || m.title) || `anime-mal-${m.mal_id}`;
        if (usedSlugs.has(slug)) slug = `${slug}-mal${m.mal_id}`;
        usedSlugs.add(slug);
        haveMal.add(m.mal_id);
        haveNameYear.add(nameKey);
        const type = ({ TV: 'tv', Movie: 'movie', OVA: 'ova', ONA: 'ona', Special: 'special', Music: 'special' })[m.type] ?? 'tv';
        added.push({
          anilistId: -m.mal_id, // синтетический уникальный id (см. шапку)
          malId: m.mal_id,
          slug,
          ru: m.title,
          romaji: m.title_japanese || m.title,
          en: m.title_english ?? null,
          type,
          year: yearM,
          season: null,
          status: ({ 'Currently Airing': 'ongoing', 'Finished Airing': 'finished', 'Not yet aired': 'upcoming', 'On Hiatus': 'ongoing', Cancelled: 'finished' })[m.status] ?? 'finished',
          episodes: m.episodes || (type === 'movie' ? 1 : 12),
          score: Math.round((m.score ?? 0) * 10) / 10,
          favourites: Math.round((m.members ?? 0) / 20), // members MAL → шкала favourites AniList (~1:20)
          genres: (m.genres ?? []).map((x) => String(x.name).toLowerCase().replace(/ /g, '-')).filter((x) => !BAD_GENRES.has(x)),
          poster: m.images?.jpg?.large_image_url ?? m.images?.jpg?.image_url ?? null,
          banner: null,
          trailer: m.trailer?.youtube_id ?? null,
          description: clean(m.synopsis).slice(0, 400),
          studios: (m.studios ?? []).map((s) => s.name),
          metaSource: 'jikan',
          shikimori: null,
          relations: [],
          characters: [],
          airing: [],
        });
        newOnPage++;
        sinceSave++;
        if (sinceSave >= 25) {
          saveTitles();
          sinceSave = 0;
        }
      }
      console.log(`[жанр ${g.name} · год ${year} · стр ${page}/${lastPage}] · новых ${added.length} · всего просмотрено ${scanned}`);
      saveProgress(gi, year, page + 1);
      if (newOnPage === 0 && page >= 2) break; // окно исчерпано против каталога
      await sleep(SLEEP_MS);
    }
    saveProgress(gi, year, 1);
  }
}

if (added.length) saveTitles();
mkdirSync('.cache', { recursive: true });
writeFileSync(PROGRESS, JSON.stringify(capReached() ? { gi: 0, year: YEAR_FROM, page: 1, added: added.length } : {}));
console.log(`итог: ${titles.length + added.length} тайтлов (добавлено Jikan: ${added.length}, квота ${MAX_NEW})`);
