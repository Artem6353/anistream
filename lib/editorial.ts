import type { Season, Title } from './types';
import { SEASON_LABELS, SOURCE_LABELS, STATUS_LABELS, TYPE_LABELS, genreLabel } from './labels';
import { plural } from './format';
import { loadTitles, similarTitles } from './catalog';

/**
 * Редполитика описаний (волна SEO-9, 01.10): уникальные редакционные абзацы,
 * сгенерированные ДЕТЕРМИНИРОВАННО из данных каталога (без выдуманных фактов):
 * паспорт тайтла, рейтинговый перцентиль, жанровое ядро, первоисточник,
 * похожие тайтлы (внутренние ссылки), свежесть эфира. Цель — уникальность
 * страниц тайтлов и сезон-хабов поверх общих описаний AniList/Shikimori.
 */

export const SEASON_SLUGS: Record<Season, string> = { spring: 'vesna', summer: 'leto', fall: 'osen', winter: 'zima' };
const SLUG_SEASONS: Record<string, Season> = { vesna: 'spring', leto: 'summer', osen: 'fall', zima: 'winter' };

export const seasonSlug = (season: Season, year: number) => `${SEASON_SLUGS[season]}-${year}`;

export function parseSeasonSlug(slug: string): { season: Season; year: number } | null {
  const m = slug.match(/^(vesna|leto|osen|zima)-(\d{4})$/);
  if (!m) return null;
  const season = SLUG_SEASONS[m[1]];
  const year = Number(m[2]);
  if (!season || !Number.isFinite(year)) return null;
  return { season, year };
}

export const seasonTitle = (season: Season, year: number) => `${SEASON_LABELS[season]} ${year}`;

/* ---------- рейтинговый контекст каталога (memo) ---------- */
let SCORE_CTX: { sorted: number[]; avg: number } | null = null;
function scoreCtx() {
  if (SCORE_CTX) return SCORE_CTX;
  const sorted = loadTitles()
    .map((t) => t.score)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);
  SCORE_CTX = { sorted, avg: sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length) };
  return SCORE_CTX;
}
export const catalogAvgScore = () => scoreCtx().avg;
/** Доля оценённых тайтлов каталога со score СТРОГО ниже данного (0..100). */
export function scorePercentile(score: number): number {
  const { sorted } = scoreCtx();
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < score) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((100 * lo) / Math.max(1, sorted.length));
}

/* ---------- редакционная справка тайтла ---------- */
export interface Editorial {
  heading: string;
  paragraphs: string[];
  links: { href: string; name: string }[];
}

export function titleEditorial(t: Title): Editorial {
  const paragraphs: string[] = [];
  const links: { href: string; name: string }[] = [];

  // 1) паспорт
  const when = t.season ? `сезон — ${SEASON_LABELS[t.season]} ${t.year || '—'}` : t.year ? `${t.year} год` : 'год не объявлен';
  const eps = t.episodes ? ` Серий: ${t.episodes}${t.duration ? ` по ~${t.duration} мин` : ''}.` : '';
  const studio = t.studios?.length ? ` Студия: ${t.studios[0]}.` : '';
  paragraphs.push(`${TYPE_LABELS[t.type] ?? t.type}, ${when}. Статус: ${STATUS_LABELS[t.status]?.toLowerCase() ?? t.status}.${eps}${studio}`);

  // 2) рейтинговый контекст
  if (t.score > 0) {
    const p = scorePercentile(t.score);
    paragraphs.push(
      `Оценка аудитории AniList — ${t.score.toFixed(1)} из 10: выше ${p}% оценённых тайтлов каталога (среднее по каталогу — ${catalogAvgScore().toFixed(1)}).` +
        (t.favourites > 0 ? ` В избранных у ${t.favourites.toLocaleString('ru-RU')} зрителей.` : ''),
    );
  }

  // 3) жанровое ядро + первоисточник
  const genres = (t.genres ?? []).slice(0, 3).map((g) => genreLabel(g).toLowerCase());
  if (genres.length) {
    let s = `Жанровое ядро: ${genres.join(', ')}.`;
    const src = t.source ? SOURCE_LABELS[t.source] ?? String(t.source).toLowerCase() : '';
    if (src) s += ` Первоисточник: ${src}.`;
    paragraphs.push(s);
  }

  // 4) похожие (внутренние ссылки)
  const sim = similarTitles(t, 3).filter((x) => x.score > 0);
  if (sim.length) {
    paragraphs.push(`Близкие по жанрам и тону: ${sim.map((x) => `«${x.ru}»`).join(', ')} — точка продолжения, когда этот тайтл досмотрен.`);
    for (const x of sim) links.push({ href: `/anime/${x.slug}`, name: x.ru });
  }

  // 5) свежесть эфира
  const air = t.airing ?? [];
  if (air.length && t.status === 'ongoing') {
    const last = air.reduce((m, a) => (a.at > m.at ? a : m), air[0]);
    if (last.at > 0) paragraphs.push(`Свежесть ленты: последняя серия вышла ${ruDate(last.at)} (эп. ${last.ep}); расписание выхода обновляется автоматически.`);
  } else if (air.length && t.status === 'upcoming') {
    const first = air.reduce((m, a) => (a.at < m.at ? a : m), air[0]);
    if (first.at > 0) paragraphs.push(`Премьера по графику AniList: ${ruDate(first.at)}.`);
  }

  return { heading: 'Об этом тайтле в AniNova', paragraphs, links };
}

const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function ruDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${RU_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* ---------- сезон-хабы ---------- */
export interface SeasonCombo {
  season: Season;
  year: number;
  slug: string;
  count: number;
}

/** Комбинации сезон-год с тайтлами (порог 3) + текущий/следующий сезон всегда. */
export function seasonCombos(): SeasonCombo[] {
  const map = new Map<string, SeasonCombo>();
  for (const t of loadTitles()) {
    if (!t.season || !t.year) continue;
    const slug = seasonSlug(t.season, t.year);
    const e = map.get(slug) ?? { season: t.season, year: t.year, slug, count: 0 };
    e.count += 1;
    map.set(slug, e);
  }
  /* Пустые сезоны (count=0) в индекс не пускаем: тонкие страницы без контента.
     Текущий/следующий сезон попадают автоматически, как только есть анонсы. */
  return [...map.values()]
    .filter((c) => c.count >= 1)
    .sort((a, b) => b.year - a.year || seasonOrder(a.season) - seasonOrder(b.season));
}

function seasonOrder(s: Season): number {
  return { winter: 0, spring: 1, summer: 2, fall: 3 }[s];
}
export function seasonItems(season: Season, year: number): Title[] {
  return loadTitles()
    .filter((t) => t.season === season && t.year === year)
    .sort((a, b) => b.favourites - a.favourites);
}

/** Редакционный абзац сезона + мета-строки (уникальны по данным сезона). */
export function seasonEditorial(season: Season, year: number, items: Title[]): { paragraphs: string[]; metaTitle: string; metaDesc: string } {
  const n = items.length;
  const ongoing = items.filter((t) => t.status === 'ongoing').length;
  const upcoming = items.filter((t) => t.status === 'upcoming').length;
  const finished = items.filter((t) => t.status === 'finished').length;
  const label = seasonTitle(season, year);
  const p1 = `Сезон ${label}: в каталоге AniNova ${n} ${plural(n, ['тайтл', 'тайтла', 'тайтлов'])} — ${ongoing} ${plural(ongoing, ['онгоинг', 'онгоинга', 'онгоингов'])}, ${upcoming} ${plural(upcoming, ['анонс', 'анонса', 'анонсов'])}, ${finished} ${plural(finished, ['завершённый', 'завершённых', 'завершённых'])}. Список собран по графику AniList и пополняется автоматически.`;
  const top3 = [...items].sort((a, b) => b.favourites - a.favourites).slice(0, 3);
  const p2 = top3.length
    ? `Лидеры внимания аудитории: ${top3.map((t) => `«${t.ru}»${t.score > 0 ? ` (${t.score.toFixed(1)})` : ''}`).join(', ')}.`
    : 'Сезон ещё наполняется: тайтлы появятся по мере анонсов.';
  const gmap = new Map<string, number>();
  for (const t of items) for (const g of t.genres ?? []) gmap.set(g, (gmap.get(g) ?? 0) + 1);
  const g3 = [...gmap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const scores = items.map((t) => t.score).filter((s) => s > 0);
  const savg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const p3 = g3.length
    ? `Жанровая картина сезона: ${g3.map(([g, c]) => `${genreLabel(g).toLowerCase()} (${c})`).join(', ')}.` +
      (savg ? ` Средний рейтинг сезона — ${savg.toFixed(1)} при среднем по каталогу ${catalogAvgScore().toFixed(1)}.` : '')
    : '';
  const metaTitle = `Аниме ${label} — список сезона (${n} ${plural(n, ['тайтл', 'тайтла', 'тайтлов'])})`;
  const metaDesc = `${p1} ${p2}`.slice(0, 155);
  return { paragraphs: [p1, p2, p3].filter(Boolean), metaTitle, metaDesc };
}

/** Соседние сезоны (пред/след) из реально существующих комбинаций. */
export function seasonNeighbors(slug: string, combos: SeasonCombo[]): { prev?: SeasonCombo; next?: SeasonCombo } {
  const idx = combos.findIndex((c) => c.slug === slug);
  if (idx === -1) return {};
  // combos отсортированы по убыванию года: next = более новый (idx-1), prev = более старый (idx+1)
  return { prev: combos[idx + 1], next: combos[idx - 1] };
}
