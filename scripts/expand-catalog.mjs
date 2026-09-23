/* Расширение каталога до 5000+ тайтлов AniList + связи франшиз + персонажи + трейлеры + эфиры.
   Запуск: node scripts/expand-catalog.mjs [PAGES=100] */
import { readFileSync, writeFileSync } from 'node:fs';

const PAGES = Number(process.argv[2] ?? 100);
const UA = { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (AniStream catalog sync)' };
const F = `{ id idMal title{romaji english} format status season seasonYear episodes averageScore favourites genres
  coverImage{large} bannerImage trailer{id site} description(asHtml:false)
  characters(page:1,perPage:6,sort:ROLE){edges{role node{id name{full} image{large}}}}
  relations{edges{relationType node{id format title{romaji}}}}
  airingSchedule(notYetAired:false,perPage:12){nodes{episode airingAt}} }`;

const titles = JSON.parse(readFileSync('lib/data/titles.json', 'utf8'));
const have = new Map(titles.map((t) => [t.anilistId, t]));
const REL_KEEP = new Set(['SEQUEL', 'PREQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'FULL_STORY', 'SUMMARY']);
const cleanText = (s) => String(s)
  .replace(/\[(\/?)(character|anime|manga|spoiler|quote|url|img|b|i|u|s|code|left|center|right|size|color|noparse)[^\]]*\]/gi, '')
  .replace(/<[^>]+>/g, '')
  .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&mdash;/g, '—').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();
const added = [];
let fetched = 0;

for (let page = 1; page <= PAGES; page++) {
  const q = {
    query: `query($page:Int){ Page(page:$page,perPage:50){ media(type:ANIME,sort:POPULARITY_DESC) ${F} } }`,
    variables: { page },
  };
  let j = null;
  for (let a = 0; a < 6 && !j?.data; a++) {
    try {
      const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: UA, body: JSON.stringify(q) });
      if (r.status === 429) { await new Promise((r2) => setTimeout(r2, 4000 * (a + 1))); continue; }
      j = await r.json();
      if (j?.errors) { console.log('стр', page, 'ошибка:', JSON.stringify(j.errors).slice(0, 160)); j = null; await new Promise((r2) => setTimeout(r2, 2000)); }
    } catch { await new Promise((r2) => setTimeout(r2, 1500)); }
  }
  const media = j?.data?.Page?.media ?? [];
  if (!media.length) { console.log('стр', page, 'пусто — стоп'); break; }
  for (const m of media) {
    fetched++;
    if (have.has(m.id)) {
      const t = have.get(m.id);
      if (!t.relations?.length) t.relations = (m.relations?.edges ?? []).filter((e) => REL_KEEP.has(e.relationType)).map((e) => ({ id: e.node.id, type: e.relationType }));
      if (!t.characters?.length) t.characters = (m.characters?.edges ?? []).map((e) => ({ name: e.node.name.full, img: e.node.image?.large ?? null, role: e.role }));
      if (!t.airing?.length && m.airingSchedule?.nodes?.length) t.airing = m.airingSchedule.nodes.map((n) => ({ ep: n.episode, at: n.airingAt * 1000 }));
      continue;
    }
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
  process.stdout.write(`\rстр ${page}/${PAGES} · получено ${fetched} · новых ${added.length}`);
  await new Promise((r2) => setTimeout(r2, 700));
}
console.log('');
const all = [...have.values()].sort((a, b) => b.favourites - a.favourites);
const seen = new Set();
for (const t of all) { if (seen.has(t.slug)) t.slug = `${t.slug}-${t.anilistId}`; seen.add(t.slug); }
writeFileSync('lib/data/titles.json', JSON.stringify(all));
console.log(`итог: ${all.length} тайтлов (добавлено ${added.length})`);
