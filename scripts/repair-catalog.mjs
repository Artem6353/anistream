/* Разовая починка каталога lib/data/titles.json (аудит 2026-10, ТЗ 1.2 / 1.4 / 3.1).
 *
 * Что лечит (ОФЛАЙН, без сети — детерминированно и идемпотентно):
 *   --fix-episodes   заглушки импортера в `episodes`. Импортёр писал
 *                    `m.episodes || (MOVIE ? 1 : RELEASING ? 24 : 12)`, поэтому в
 *                    каталоге не было ни одного episodes=null, а у «Ван-Пис» стояло 24
 *                    при 1134 вышедших сериях (страница серии 25 отдавала 404).
 *                    Правило — то же, что в lib/episodes.ts.
 *   --fix-desc       описания, оборванные посреди слова (1784 из 8017): импортёр резал
 *                    `clean(desc).slice(0, 900)`. ВАЖНО: офлайн текст не восстановить —
 *                    хвост предложения физически отброшен. Флаг обрезает то, что можно,
 *                    остальное помечает needsDescriptionRefresh и пишет список в
 *                    .cache/truncated-descriptions.json.
 *   --fix-desc-net   дочитать ПОЛНЫЕ описания из Shikimori и обрезать по предложению
 *                    (нужен SHIKIMORI_USER_AGENT; 1784 тайтла ≈ 35 минут).
 *   --fix-dupes      одинаковые русские названия → добавляем год в скобках
 *                    («Провожающая в последний путь Фрирен 2» встречалось дважды:
 *                    2nd Season 2026 и 3rd Season 2027).
 *   --fix-studios    лицензиары/продюсеры в поле studios (у «Ван-Пис» там Funimation).
 *                    Jikan отдаёт всех участников производства, фильтр
 *                    isAnimationStudio в scripts/fetch-jikan.mjs отсутствовал.
 *
 * Что лечит через сеть (нужен SHIKIMORI_USER_AGENT, ~1 req/s):
 *   --fix-shiki-eps      episodes_aired для онгоингов (Shikimori: у «Ван-Пис» 1180).
 *   --fix-characters     русские имена персонажей (/api/animes/{id}/roles): сейчас
 *                        «Luffy Monkey» вместо «Манки Д. Луффи».
 *
 * Запуск:
 *   node scripts/repair-catalog.mjs --report                 # только диагностика
 *   node scripts/repair-catalog.mjs --fix-episodes --fix-desc --fix-dupes --fix-studios --apply
 *   node scripts/repair-catalog.mjs --fix-shiki-eps --limit 300 --apply
 * Без --apply изменения не записываются (печатается отчёт). Бэкап — в backups/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const FILE = process.env.TITLES_FILE ?? 'lib/data/titles.json';
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const argVal = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split('=')[1] : dflt;
};

const APPLY = has('--apply');
const LIMIT = Number(argVal('limit', process.env.LIMIT ?? 0));
const SLEEP_MS = Number(process.env.SLEEP_MS ?? 1100);
const SHIKI_WORKERS = Math.min(3, Number(process.env.SHIKI_WORKERS ?? 3));
const UA = { 'User-Agent': process.env.SHIKIMORI_USER_AGENT || 'AniNova catalog repair (aninova-catalog.vercel.app)' };

/** Заглушки, которые подставлял scripts/expand-catalog.mjs вместо неизвестного числа. */
const STUBS = new Set([12, 24]);

/** Не анимационные студии: лицензиары, продюсеры, вещатели (ТЗ 3.1.3). */
const NOT_STUDIOS = new Set(
  [
    'Funimation', 'Viz Media', 'Aniplex', 'Aniplex of America', 'Crunchyroll', 'Sentai Filmworks',
    'Nihon Ad Systems', 'Dentsu', 'Mainichi Broadcasting System', 'TV Tokyo', 'Toho', 'Shueisha',
    'Kodansha', 'Shogakukan-Shueisha Productions', 'Bandai Visual', 'Bandai Namco Arts', 'Lantis',
    'Sony Pictures Entertainment', 'Hakuhodo DY Media Partners', 'Kadokawa', 'Kadokawa Shoten',
    'ASCII Media Works', 'AT-X', 'BS Fuji', 'NHK', 'TBS', 'Fuji TV', 'Yomiuri Telecasting',
    'Shochiku', 'Toei Company', 'Square Enix', 'Konami', 'Sega', 'Bandai', 'Bandai Namco Games',
    'VAP', 'King Records', 'Avex Entertainment', 'Pony Canyon', 'Media Factory', 'Houbunsha',
    'Ichijinsha', 'Enterbrain', 'Frontier Works', 'Marvelous', 'Marvelous AQL', 'TMS Music',
    'Geneon Universal Entertainment', 'NBCUniversal Entertainment', 'Warner Bros. Japan',
    'Walt Disney Studios', 'Netflix', 'Amazon Studios', 'Hulu', 'ADK Emotions', 'Asatsu DK',
    'Sotsu', 'Sotsu Music Publishing', 'Pierrot Plus', 'DMM.com', 'Cygames', 'Movic',
    'Bushiroad', 'Good Smile Company', 'KlockWorx', 'Nippon Television Network', 'TV Asahi',
    'MBS', 'Rakuten', 'Gree', 'Mixi', 'CyberAgent', 'Happinet', 'Pony Canyon Enterprises',
  ].map((s) => s.toLowerCase()),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titles = JSON.parse(readFileSync(FILE, 'utf8'));
const changed = new Map(); // anilistId → [причины]
function touch(t, reason) {
  if (!changed.has(t.anilistId)) changed.set(t.anilistId, []);
  changed.get(t.anilistId).push(reason);
}

/* ------------------------------ 1) серии --------------------------------- */

const maxKnownEpisode = (t) => {
  let max = 0;
  for (const a of t.airing ?? []) if (a.ep > max) max = a.ep;
  const ed = t.epdates;
  if (ed) for (const k of Object.keys(ed)) { const n = Number(k); if (Number.isFinite(n) && n > max) max = n; }
  return max;
};

function fixEpisodes() {
  const stat = { ongoingStub: 0, upcomingStub: 0, movieWrong: 0, finishedUnknown: 0, released: 0 };
  for (const t of titles) {
    const aired = maxKnownEpisode(t);
    const stated = Number.isFinite(t.episodes) && t.episodes !== null ? Number(t.episodes) : null;
    const stub = stated !== null && STUBS.has(stated);

    if (t.status === 'upcoming') {
      // Анонс: выдуманное «12 серий» убираем, если его ничто не подтверждает.
      if (stated !== null && stub && !aired) { t.episodes = null; stat.upcomingStub++; touch(t, `episodes ${stated} → null (анонс, заглушка)`); }
      continue;
    }
    if (t.type === 'movie' && !aired) {
      if (stated !== 1) { t.episodes = 1; stat.movieWrong++; touch(t, `episodes ${stated} → 1 (фильм)`); }
      continue;
    }
    if (t.status === 'ongoing') {
      // Онгоинг: «вышло» = максимум известного; итог неизвестен, если стояла заглушка.
      t.episodesReleased = aired > 0 ? aired : stated !== null && !stub ? stated : null;
      if (aired > 0) stat.released++;
      if (stated !== null && stub && aired > stated) {
        t.episodes = null;
        stat.ongoingStub++;
        touch(t, `episodes ${stated} → null (онгоинг, вышло ${aired})`);
      } else if (stated !== null && stated <= aired) {
        t.episodes = null;
        stat.ongoingStub++;
        touch(t, `episodes ${stated} → null (онгоинг, вышло ${aired} ≥ итога)`);
      }
      continue;
    }
    // finished
    if (stated === null || (stub && aired > stated)) {
      if (aired > 0) { t.episodes = aired; stat.finishedUnknown++; touch(t, `episodes ${stated} → ${aired} (по датам серий)`); }
    }
  }
  return stat;
}

/* ------------------------------ 2) описания ------------------------------- */

/** Концы предложений: . ! ? … и закрывающая кавычка после них. */
function sentenceEnds(text) {
  const ends = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    if (ch === '.' && i > 0 && /[0-9а-яa-z]\.[0-9а-яa-z]/i.test(text.slice(i - 1, i + 2))) continue;
    let end = i + 1;
    while (end < text.length && /["»')\]]/.test(text[end])) end++;
    if (end === text.length || /\s/.test(text[end])) ends.push(end);
  }
  return ends;
}

/** Обрезать по границе предложения (тот же алгоритм, что в lib/text.ts). */
function clampToSentence(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  const ends = sentenceEnds(t).filter((e) => e <= max);
  if (ends.length) return t.slice(0, ends[ends.length - 1]).trim();
  const raw = t.slice(0, max);
  const sp = raw.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? raw.slice(0, sp) : raw).replace(/[,;:—\-–\s]+$/, '')}…`;
}

const endsCleanly = (s) => /[.!?…]["»')\]]?$/.test(String(s).trim());

function fixDescriptions(max = 900) {
  /* Офлайн полный текст НЕ восстановить: хвост предложения физически отброшен при
     импорте (`slice(0, 900)`). Поэтому здесь два действия:
       (а) обрезать по границе предложения то, где внутри текста остались предложения;
       (б) пометить остальные needsDescriptionRefresh и выгрузить список в .cache —
           полный текст дочитывает --fix-desc-net из Shikimori. */
  const stat = { clampedTop: 0, clampedAlt: 0, marked: 0 };
  const list = [];
  for (const t of titles) {
    if (t.description && !endsCleanly(t.description)) {
      const before = t.description;
      const clamped = clampToSentence(before, max);
      if (clamped !== before) {
        t.description = clamped;
        stat.clampedTop++;
        touch(t, `описание: обрыв «…${before.slice(-24)}» → по границе предложения`);
      } else {
        t.needsDescriptionRefresh = true;
        stat.marked++;
        list.push({ slug: t.slug, anilistId: t.anilistId, shikimoriId: t.shikimori?.id ?? null, tail: before.slice(-40) });
        touch(t, `описание оборвано на «…${before.slice(-24)}» — помечен для переимпорта`);
      }
    }
    const alt = t.shikimori?.description;
    if (alt && !endsCleanly(alt)) {
      const clamped = clampToSentence(alt, max);
      if (clamped !== alt) { t.shikimori.description = clamped; stat.clampedAlt++; }
    }
  }
  mkdirSync('.cache', { recursive: true });
  writeFileSync(
    '.cache/truncated-descriptions.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), count: list.length, items: list }, null, 2),
  );
  stat.report = '.cache/truncated-descriptions.json';
  return stat;
}

const stripBbcode = (s) =>
  String(s ?? '')
    .replace(/\[(\/?)[a-z_]+[^\]]*\]/gi, '')
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

/** Дочитывает ПОЛНЫЕ описания из Shikimori и режет их по границе предложения (ТЗ 1.4.3). */
async function refetchDescriptions(max = 900) {
  const pool = titles.filter((t) => t.needsDescriptionRefresh && t.shikimori?.id);
  const plan = LIMIT > 0 ? pool.slice(0, LIMIT) : pool;
  let fixed = 0;
  let empty = 0;
  const queue = [...plan];
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift();
      const data = await shiki(`/api/animes/${t.shikimori.id}`);
      await sleep(SLEEP_MS / SHIKI_WORKERS);
      const full = stripBbcode(data?.description);
      if (!full) { empty++; continue; }
      t.description = clampToSentence(full, max);
      if (t.shikimori) t.shikimori.description = clampToSentence(full, max);
      delete t.needsDescriptionRefresh;
      fixed++;
      touch(t, 'описание перечитано из Shikimori целиком');
    }
  };
  await Promise.all(Array.from({ length: SHIKI_WORKERS }, worker));
  return { planned: plan.length, fixed, empty };
}

/* --------------------------- 3) дубли названий ---------------------------- */

function fixDuplicateNames() {
  const byName = new Map();
  for (const t of titles) {
    const key = (t.ru ?? '').trim();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(t);
  }
  let renamed = 0;
  let ambiguous = 0;
  const samples = [];
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    // Год уже в названии или годы совпадают — год в скобках не поможет.
    const years = new Set(list.map((t) => t.year).filter((y) => y > 0));
    if (years.size < list.length) { ambiguous += list.length; continue; }
    for (const t of list) {
      if (!t.year || /\(\d{4}\)/.test(t.ru)) continue;
      t.ru = `${name} (${t.year})`;
      renamed++;
      touch(t, `название: «${name}» → «${t.ru}» (дубль)`);
      if (samples.length < 12) samples.push(`${name} → ${t.ru}`);
    }
  }
  return { renamed, ambiguous, samples };
}

/* ------------------------------- 4) студии -------------------------------- */

function fixStudios() {
  let cleaned = 0;
  let emptied = 0;
  for (const t of titles) {
    if (!t.studios?.length) continue;
    const before = t.studios.length;
    t.studios = t.studios.filter((s) => s && !NOT_STUDIOS.has(String(s).trim().toLowerCase()));
    if (t.studios.length !== before) {
      cleaned++;
      touch(t, `studios: убраны лицензиары/продюсеры (${before} → ${t.studios.length})`);
      if (!t.studios.length) emptied++;
    }
  }
  return { cleaned, emptied };
}

/* --------------------- 5) Shikimori: вышло серий и имена ------------------- */

async function shiki(path) {
  for (const host of ['https://shikimori.io', 'https://shikimori.one']) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${host}${path}`, { headers: UA, signal: AbortSignal.timeout(20_000) });
        if (r.status === 429 || r.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
        if (!r.ok) return null;
        return await r.json();
      } catch { await sleep(1500 * (attempt + 1)); }
    }
  }
  return null;
}

async function fixShikimoriEpisodes() {
  const pool = titles.filter((t) => t.status === 'ongoing' && t.shikimori?.id);
  const plan = LIMIT > 0 ? pool.slice(0, LIMIT) : pool;
  let fixed = 0;
  const queue = [...plan];
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift();
      const data = await shiki(`/api/animes/${t.shikimori.id}`);
      await sleep(SLEEP_MS / SHIKI_WORKERS);
      const aired = Number(data?.episodes_aired);
      if (!Number.isFinite(aired) || aired <= 0) continue;
      const prev = t.episodesReleased ?? 0;
      // Для онгоинга приоритет у БОЛЬШЕГО из «вышло» (ТЗ 1.3.2 / 1.2).
      if (aired > prev) { t.episodesReleased = aired; fixed++; touch(t, `episodesReleased ${prev} → ${aired} (Shikimori)`); }
      const total = Number(data?.episodes);
      if (Number.isFinite(total) && total > 0 && (t.episodes === null || t.episodes === undefined) && total >= aired) {
        t.episodes = total;
        touch(t, `episodes → ${total} (Shikimori, объявленный итог)`);
      }
    }
  };
  await Promise.all(Array.from({ length: SHIKI_WORKERS }, worker));
  return { checked: plan.length, fixed };
}

async function fixCharacters() {
  const pool = titles.filter((t) => t.shikimori?.id && (t.characters?.length ?? 0) > 0);
  const plan = LIMIT > 0 ? pool.slice(0, LIMIT) : pool;
  let fixed = 0;
  const queue = [...plan];
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift();
      const roles = await shiki(`/api/animes/${t.shikimori.id}/roles`);
      await sleep(SLEEP_MS / SHIKI_WORKERS);
      if (!Array.isArray(roles) || !roles.length) continue;
      /* Ответ большой (у «Ван-Пис» 800 КБ на весь каст): берём только главных
         и сопоставляем по латинскому имени, которое AniList пишет как «Given Family». */
      const ruByName = new Map();
      for (const r of roles) {
        const c = r?.character;
        if (!c?.name || !c?.russian) continue;
        const isMain = (r.roles ?? []).some((x) => String(x).toLowerCase() === 'main');
        if (!isMain) continue;
        ruByName.set(String(c.name).trim().toLowerCase(), String(c.russian).trim());
        // AniList name.full бывает и в порядке «Family Given» — добавляем перевёрнутый ключ.
        const parts = String(c.name).trim().split(/\s+/);
        if (parts.length > 1) ruByName.set(parts.slice().reverse().join(' ').toLowerCase(), String(c.russian).trim());
      }
      if (!ruByName.size) continue;
      let touchedHere = false;
      for (const ch of t.characters ?? []) {
        const key = String(ch.name ?? '').trim().toLowerCase();
        const ru = ruByName.get(key);
        if (ru && ru !== ch.name) { ch.name = ru; touchedHere = true; }
      }
      if (touchedHere) { fixed++; touch(t, 'characters: русские имена из Shikimori'); }
    }
  };
  await Promise.all(Array.from({ length: SHIKI_WORKERS }, worker));
  return { checked: plan.length, fixed };
}

/* --------------------------------- запуск --------------------------------- */

function backup() {
  if (!APPLY) return null;
  mkdirSync('backups', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `backups/titles-before-repair-${stamp}.json`;
  writeFileSync(path, readFileSync(FILE));
  return path;
}

const stats = {};
if (has('--fix-episodes')) stats.episodes = fixEpisodes();
if (has('--fix-desc')) stats.descriptions = fixDescriptions(Number(argVal('desc-max', 900)));
if (has('--fix-dupes')) stats.duplicateNames = fixDuplicateNames();
if (has('--fix-studios')) stats.studios = fixStudios();
if (has('--fix-desc-net')) stats.descriptionsRefetch = await refetchDescriptions(Number(argVal('desc-max', 900)));
if (has('--fix-shiki-eps')) stats.shikimoriEpisodes = await fixShikimoriEpisodes();
if (has('--fix-characters')) stats.characters = await fixCharacters();

if (!Object.keys(stats).length) {
  console.log('Нужен хотя бы один флаг: --fix-episodes --fix-desc --fix-desc-net --fix-dupes --fix-studios --fix-shiki-eps --fix-characters');
  process.exit(2);
}

const report = {
  generatedAt: new Date().toISOString(),
  applied: APPLY,
  totalTitles: titles.length,
  touchedTitles: changed.size,
  stats,
  samples: [...changed.entries()].slice(0, 20).map(([id, reasons]) => ({
    anilistId: id,
    slug: titles.find((t) => t.anilistId === id)?.slug,
    reasons,
  })),
};

if (APPLY) {
  const path = backup();
  writeFileSync(FILE, JSON.stringify(titles));
  console.log(`бэкап: ${path}`);
  mkdirSync('.cache', { recursive: true });
  writeFileSync('.cache/repair-catalog-report.json', JSON.stringify(report, null, 2));
} else {
  console.log('(режим отчёта: добавьте --apply, чтобы записать изменения)');
}
console.log(JSON.stringify(report, null, 2));
