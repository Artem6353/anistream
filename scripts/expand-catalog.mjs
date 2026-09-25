/* Расширение каталога: проходы AniList + связи франшиз + персонажи + трейлеры + эфиры.
   Базовые проходы (каждый запуск, включая cron):
     1) sort:POPULARITY_DESC                     — PAGES страниц (топ популярных, как раньше);
     2) status:RELEASING, sort:TRENDING_DESC     — 5 страниц (250 свежих онгоингов с растущим трендом);
     3) status:NOT_YET_RELEASED, sort:START_DATE — 3 страницы (150 анонсов ближайшего времени).
   Глубокие проходы (разовое расширение, --deep или DEEP=1/true; в cron НЕ участвуют):
     4) sort:FAVOURITES_DESC     стр. 60–100, порог favourites ≥ 60;
     5) format:MOVIE, POPULARITY стр. 13–22,  порог favourites ≥ 30;
     6) format:ONA,   POPULARITY стр. 9–14,   порог favourites ≥ 30;
     7) format:OVA,   POPULARITY стр. 11–16,  порог favourites ≥ 30.
   Зачем: AniList API имеет жёсткий потолок 5000 записей на окно запроса
   ("Page depth exceeds maximum allowed for API requests (5000 entries)"), а окно
   популярности каталог уже покрыл целиком — новые тайтлы берутся из альтернативных
   окон (рейтинг избранного, форматные топы, онгоинги/анонсы).
   MAX_NEW (по умолчанию 400 при --deep, 0 = без лимита) — жёсткая квота новых тайтлов:
   при её достижении прекращается и добывание страниц, и добавление; остаток пула
   достаётся следующему запуску (проходы идемпотентны).
   Все запросы идут с isAdult:false — каталог сохраняет чистую политику 18+.

   Проходы собирают общий массив media, затем дедупликация по anilistId (первое вхождение
   выигрывает). Существующие тайтлы не перезаписываются — только дозаполняются пропущенные
   relations/characters/airing (идемпотентно: повторный запуск ничего не добавляет).
   Слаги существующих тайтлов НЕ переименовываются никогда (их URL и кэш провайдеров
   остаются живы); суффикс -<anilistId> получает только НОВЫЙ тайтл при коллизии слага.
   Запуск: node scripts/expand-catalog.mjs [PAGES=100] [--report] [--deep]
   Env: DEEP=1|true, MAX_NEW=<число>
   --report: после обхода вывести в stdout таблицу «Добавлено / Обновлено / Пропущено (уже есть)». */
import { readFileSync, writeFileSync } from 'node:fs';

const ARGS = process.argv.slice(2);
const REPORT = ARGS.includes('--report');
const DEEP = ARGS.includes('--deep') || process.env.DEEP === '1' || process.env.DEEP === 'true';
const MAX_NEW = Number(process.env.MAX_NEW || (DEEP ? 400 : 0));
const PAGES = Number(ARGS.find((a) => !a.startsWith('--')) ?? 100);
const UA = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (AniNova catalog sync)' };
const F = `{ id idMal title{romaji english} format status season seasonYear episodes averageScore favourites genres
  coverImage{large} bannerImage trailer{id site} description(asHtml:false)
  characters(page:1,perPage:6,sort:ROLE){edges{role node{id name{full} image{large}}}}
  relations{edges{relationType node{id format title{romaji}}}}
  airingSchedule(notYetAired:false,perPage:12){nodes{episode airingAt}} }`;

const PASSES = [
  { label: 'популярные', pages: PAGES, filter: 'sort:POPULARITY_DESC' },
  { label: 'онгоинги', pages: 5, filter: 'status:RELEASING,sort:TRENDING_DESC' },
  { label: 'анонсы', pages: 3, filter: 'status:NOT_YET_RELEASED,sort:START_DATE' },
];
if (DEEP) {
  PASSES.push(
    { label: 'favourites·deep', from: 60, pages: 100, filter: 'sort:FAVOURITES_DESC', minFavs: 60 },
    { label: 'фильмы·deep', from: 13, pages: 22, filter: 'format:MOVIE,sort:POPULARITY_DESC', minFavs: 30 },
    { label: 'ONA·deep', from: 9, pages: 14, filter: 'format:ONA,sort:POPULARITY_DESC', minFavs: 30 },
    { label: 'OVA·deep', from: 11, pages: 16, filter: 'format:OVA,sort:POPULARITY_DESC', minFavs: 30 },
  );
  console.log(`глубокое расширение: ВКЛ · MAX_NEW=${MAX_NEW || 'без лимита'} · проходы: favourites(60–100, fav≥60), фильмы(13–22, fav≥30), ONA(9–14, fav≥30), OVA(11–16, fav≥30)`);
}

const titles = JSON.parse(readFileSync('lib/data/titles.json', 'utf8'));
const have = new Map(titles.map((t) => [t.anilistId, t]));
const REL_KEEP = new Set(['SEQUEL', 'PREQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'FULL_STORY', 'SUMMARY']);
const cleanText = (s) => String(s)
  .replace(/\[(\/?)(character|anime|manga|spoiler|quote|url|img|b|i|u|s|code|left|center|right|size|color|noparse)[^\]]*\]/gi, '')
  .replace(/<[^>]+>/g, '')
  .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&mdash;/g, '—').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

/* Квота MAX_NEW: newSeen — новые кандидаты, прошедшие порог качества (minFavs).
   Добывание страниц/проходов прекращается, как только кандидатов достаточно;
   точное отсечение до MAX_NEW делает финальный цикл добавления. */
const newSeen = new Set();
const capReached = () => MAX_NEW > 0 && newSeen.size >= MAX_NEW;

async function fetchPass(pass) {
  const out = [];
  const from = pass.from ?? 1;
  const minFavs = pass.minFavs ?? 0;
  for (let page = from; page <= pass.pages; page++) {
    if (capReached()) { console.log(`\n[${pass.label}] квота MAX_NEW=${MAX_NEW} набрана — проход остановлен`); break; }
    const q = {
      query: `query($page:Int){ Page(page:$page,perPage:50){ media(type:ANIME,isAdult:false,${pass.filter}) ${F} } }`,
      variables: { page },
    };
    let j = null;
    for (let a = 0; a < 6 && !j?.data; a++) {
      try {
        const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: UA, body: JSON.stringify(q) });
        if (r.status === 429) { await new Promise((r2) => setTimeout(r2, 4000 * (a + 1))); continue; }
        j = await r.json();
        if (j?.errors) { console.log(`\n[${pass.label}] стр ${page} ошибка:`, JSON.stringify(j.errors).slice(0, 160)); j = null; await new Promise((r2) => setTimeout(r2, 2000)); }
      } catch { await new Promise((r2) => setTimeout(r2, 1500)); }
    }
    const media = j?.data?.Page?.media ?? [];
    if (!media.length) { console.log(`\n[${pass.label}] стр ${page} пуста — стоп`); break; }
    for (const m of media) {
      if (have.has(m.id)) { out.push(m); continue; } // существующий — для дозаполнения связей
      if ((m.favourites ?? 0) < minFavs) continue;   // ниже порога качества — не берём
      newSeen.add(m.id);
      out.push(m);
    }
    process.stdout.write(`\r[${pass.label}] стр ${page}/${pass.pages} · получено ${out.length} · новых-кандидатов ${newSeen.size}${MAX_NEW ? '/' + MAX_NEW : ''}`);
    await new Promise((r2) => setTimeout(r2, 700));
  }
  console.log(`\r[${pass.label}] готово: ${out.length} media · новых-кандидатов всего ${newSeen.size}          `);
  return out;
}

const raw = [];
for (const pass of PASSES) {
  if (capReached()) { console.log(`проход «${pass.label}» пропущен: квота MAX_NEW=${MAX_NEW} уже набрана`); continue; }
  raw.push(...(await fetchPass(pass)));
}

// общая дедупликация по anilistId: первый проход выигрывает (POPULARITY → TRENDING → START_DATE → deep)
const uniq = new Map();
for (const m of raw) if (!uniq.has(m.id)) uniq.set(m.id, m);
console.log(`дедупликация: ${raw.length} → ${uniq.size} уникальных`);

const added = [];
let updated = 0;
let skipped = 0;
let capped = 0;
for (const m of uniq.values()) {
  if (have.has(m.id)) {
    const t = have.get(m.id);
    let touched = false;
    if (!t.relations?.length) {
      t.relations = (m.relations?.edges ?? []).filter((e) => REL_KEEP.has(e.relationType)).map((e) => ({ id: e.node.id, type: e.relationType }));
      if (t.relations.length) touched = true;
    }
    if (!t.characters?.length) {
      t.characters = (m.characters?.edges ?? []).map((e) => ({ name: e.node.name.full, img: e.node.image?.large ?? null, role: e.role }));
      if (t.characters.length) touched = true;
    }
    if (!t.airing?.length && m.airingSchedule?.nodes?.length) {
      t.airing = m.airingSchedule.nodes.map((n) => ({ ep: n.episode, at: n.airingAt * 1000 }));
      touched = true;
    }
    // self-heal: последующие прогоны добирают постер/описание, если их не было
    // (у части свежих онгоингов/анонсов AniList заполняет их позже)
    if (!t.poster && m.coverImage?.large) { t.poster = m.coverImage.large; touched = true; }
    if (!t.banner && m.bannerImage) { t.banner = m.bannerImage; touched = true; }
    if (!t.description && m.description) { t.description = cleanText(m.description).slice(0, 400); touched = true; }
    if (touched) updated++; else skipped++;
    continue;
  }
  if (MAX_NEW && added.length >= MAX_NEW) { capped++; continue; } // жёсткое отсечение по квоте
  const eps = m.episodes || (m.format === 'MOVIE' ? 1 : m.status === 'RELEASING' ? 24 : 12);
  const t = {
    anilistId: m.id,
    slug: (m.title.romaji || `anime-${m.id}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `anime-${m.id}`,
    ru: m.title.romaji,
    romaji: m.title.romaji,
    en: m.title.english,
    type: ({ TV: 'tv', MOVIE: 'movie', ONA: 'ona', OVA: 'ova', SPECIAL: 'special', TV_SHORT: 'tv' })[m.format] ?? 'tv',
    year: m.seasonYear || 0,
    season: (m.season || '').toLowerCase() || null,
    status: ({ RELEASING: 'ongoing', FINISHED: 'finished', NOT_YET_RELEASED: 'upcoming', HIATUS: 'ongoing', CANCELLED: 'finished' })[m.status] ?? 'finished',
    episodes: eps,
    score: Math.round((m.averageScore || 0) / 10) / 1,
    favourites: m.favourites || 0,
    genres: (m.genres || []).map((g) => g.toLowerCase().replace(/ /g, '-')),
    poster: m.coverImage?.large,
    banner: m.bannerImage,
    trailer: m.trailer?.site === 'youtube' ? m.trailer.id : null,
    malId: m.idMal,
    description: cleanText(m.description || '').slice(0, 400),
    shikimori: null,
    relations: (m.relations?.edges ?? []).filter((e) => REL_KEEP.has(e.relationType)).map((e) => ({ id: e.node.id, type: e.relationType })),
    characters: (m.characters?.edges ?? []).map((e) => ({ name: e.node.name.full, img: e.node.image?.large ?? null, role: e.role })),
    airing: (m.airingSchedule?.nodes ?? []).map((n) => ({ ep: n.episode, at: n.airingAt * 1000 })),
  };
  t.score = Math.round((m.averageScore || 0) / 10 * 10) / 10;
  have.set(m.id, t);
  added.push(t);
}
if (capped) console.log(`квота MAX_NEW=${MAX_NEW}: ${capped} кандидатов остались на следующий запуск`);

const all = [...have.values()].sort((a, b) => b.favourites - a.favourites);
// Слаги существующих тайтлов неприкосновенны (URL/кэш провайдеров не должны тухнуть);
// суффикс -<anilistId> — только новым при коллизии.
const addedIds = new Set(added.map((t) => t.anilistId));
const usedSlugs = new Set();
for (const t of all) if (!addedIds.has(t.anilistId)) usedSlugs.add(t.slug);
let renamed = 0;
for (const t of all) {
  if (addedIds.has(t.anilistId) && usedSlugs.has(t.slug)) { t.slug = `${t.slug}-${t.anilistId}`; renamed++; }
  usedSlugs.add(t.slug);
}
if (renamed) console.log(`коллизии слагов: ${renamed} новых тайтлов получили суффикс -<anilistId>`);
writeFileSync('lib/data/titles.json', JSON.stringify(all));
console.log(`итог: ${all.length} тайтлов (добавлено ${added.length}${MAX_NEW ? `, квота ${MAX_NEW}` : ''})`);
if (REPORT) {
  console.log('');
  console.log(`Добавлено: ${added.length}`);
  console.log(`Обновлено: ${updated}`);
  console.log(`Пропущено (уже есть): ${skipped}`);
  console.log(`Не добавлено из-за квоты MAX_NEW: ${capped}`);
}
