/**
 * B1-D: валидация кандидатов русских метаданных.
 *
 * Кандидат (`CANDIDATE`) — это найденное автоматически по устойчивому id
 * название и метаданные. Он не является проверенным и не влияет на публикацию.
 * Здесь проверяется только качество самих данных: привязка к произведению,
 * отсутствие заглушек, технического текста и повреждённых значений.
 *
 * Функция чистая: скрипт `scripts/aninova3-b1d-ru-verify.mjs` и unit-тест
 * вызывают её на реальных файлах, поэтому регрессия данных ломает тест.
 */
export interface CandidateRow {
  anilist: number;
  mal?: number | null;
  titleRu?: string | null;
  name?: string | null;
  licenseNameRu?: string | null;
  kind?: string | null;
  year?: number | null;
  cover?: string | null;
  sourceUrl?: string | null;
  fetchedAt?: string | null;
  verification?: string | null;
  descriptionRu?: string | null;
}

export interface CandidateProblem {
  anilist: number;
  field: string;
  issue: string;
  value?: string;
}

const PLACEHOLDERS = new Set(['undefined', 'null', 'none', 'n/a', 'нет', '-', '—', '?', 'без названия', 'без описания']);
const SERVICE_MARKERS = /\[(character|anime|manga|person|staff)=/i;
const HTML_TAG = /<[a-z/][^>]*>/i;
const KIND_ALLOWED = new Set(['manga', 'manhwa', 'manhua', 'comic', 'webtoon', 'one_shot', 'doujin', 'novel', 'light_novel', 'manhwa_comic']);
const CYRILLIC = /[а-яё]/i;
const LETTER = /[a-zа-яё0-9]/i;

function cleanText(value: string | null | undefined, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  /* Пустая строка — дефект данных, а не «нет значения»: кандидат без названия
     нельзя показывать и нельзя считать кандидатом. */
  if (!text) return 'empty';
  if (PLACEHOLDERS.has(text.toLowerCase())) return null;
  if (HTML_TAG.test(text)) return 'html';
  if (SERVICE_MARKERS.test(text)) return 'service_marker';
  if (text.length > max) return `too_long:${text.length}`;
  if (!LETTER.test(text)) return 'no_letters';
  return null;
}

export interface CandidateValidationResult {
  checked: number;
  problems: CandidateProblem[];
  stats: {
    withCyrillicTitle: number;
    withLicenseName: number;
    withDescription: number;
    untranslatedTitle: number;
    duplicateTitles: { title: string; comics: number[] }[];
    malMismatch: number;
    unknownComic: number;
  };
}

/** Минимум данных о произведении, который нужен валидатору. */
export interface CandidateComicRef {
  externalIds: { anilist?: number | null; mal?: number | null };
  year?: number | null;
}

export function validateCandidates(
  rows: CandidateRow[],
  comics: Map<number, CandidateComicRef>,
): CandidateValidationResult {
  const problems: CandidateProblem[] = [];
  const push = (anilist: number, field: string, issue: string, value?: unknown) =>
    problems.push({ anilist, field, issue, ...(value === undefined ? {} : { value: String(value).slice(0, 120) }) });

  let withCyrillicTitle = 0;
  let withLicenseName = 0;
  let withDescription = 0;
  let untranslatedTitle = 0;
  let malMismatch = 0;
  let unknownComic = 0;
  const titleIndex = new Map<string, number[]>();

  for (const row of rows) {
    if (!Number.isFinite(row.anilist)) {
      push(0, 'anilist', 'not_a_number');
      continue;
    }
    const comic = comics.get(row.anilist);
    if (!comic) {
      unknownComic += 1;
      push(row.anilist, 'anilist', 'comic_not_in_graph');
    } else if (row.mal != null && comic.externalIds.mal != null && Number(row.mal) !== Number(comic.externalIds.mal)) {
      malMismatch += 1;
      push(row.anilist, 'mal', 'mal_mismatch', `${row.mal} ≠ ${comic.externalIds.mal}`);
    }

    const titleIssue = cleanText(row.titleRu, 300);
    if (titleIssue) push(row.anilist, 'titleRu', titleIssue, row.titleRu);
    else {
      if (CYRILLIC.test(String(row.titleRu))) withCyrillicTitle += 1;
      else untranslatedTitle += 1;
      const key = String(row.titleRu).toLowerCase().replace(/\s+/g, ' ').trim();
      const list = titleIndex.get(key) ?? [];
      list.push(row.anilist);
      titleIndex.set(key, list);
    }

    const nameIssue = cleanText(row.name, 300);
    if (nameIssue) push(row.anilist, 'name', nameIssue, row.name);

    if (row.licenseNameRu != null) {
      const licenseIssue = cleanText(row.licenseNameRu, 300);
      if (licenseIssue) push(row.anilist, 'licenseNameRu', licenseIssue, row.licenseNameRu);
      else withLicenseName += 1;
    }

    if (row.descriptionRu != null) {
      const descIssue = cleanText(row.descriptionRu, 600);
      if (descIssue) push(row.anilist, 'descriptionRu', descIssue, row.descriptionRu);
      else withDescription += 1;
    }

    if (row.kind != null && !KIND_ALLOWED.has(String(row.kind))) push(row.anilist, 'kind', 'unknown_kind', row.kind);
    if (row.year != null && (row.year < 1900 || row.year > 2035)) push(row.anilist, 'year', 'out_of_range', row.year);
    if (row.sourceUrl && !/^https:\/\/shikimori\.one\/mangas\//.test(row.sourceUrl)) {
      push(row.anilist, 'sourceUrl', 'bad_url', row.sourceUrl);
    }
    if (row.fetchedAt && Number.isNaN(Date.parse(row.fetchedAt))) push(row.anilist, 'fetchedAt', 'bad_date', row.fetchedAt);
    /* Кандидат не имеет права быть помеченным как проверенный. */
    if (row.verification !== 'CANDIDATE') push(row.anilist, 'verification', 'not_a_candidate', row.verification);
    if (row.cover != null && !/^https?:\/\//.test(String(row.cover))) push(row.anilist, 'cover', 'bad_url', row.cover);
  }

  const duplicateTitles = [...titleIndex.entries()]
    .filter(([, ids]) => ids.length > 2 && new Set(ids).size > 2)
    .map(([title, ids]) => ({ title, comics: [...new Set(ids)] }))
    .slice(0, 50);

  return {
    checked: rows.length,
    problems,
    stats: { withCyrillicTitle, withLicenseName, withDescription, untranslatedTitle, duplicateTitles, malMismatch, unknownComic },
  };
}
