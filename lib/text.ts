/**
 * Обрезка текста по границе предложения (аудит 2026-10, ТЗ 1.4).
 *
 * Раньше описания резались посреди слова двумя способами:
 *  1) на импорте — `clean(desc).slice(0, 900)` в scripts/enrich-shikimori-resumable.mjs
 *     (в каталоге 1794 описания из 8017 обрывались на полуслове: «…куда тебя»);
 *  2) в рантайме — `clampSentence()` на странице тайтла резал meta description
 *     по последнему пробелу, всё равно разрывая предложение.
 * Теперь единственный помощник: режем по концу предложения, слово не рвём.
 */

/** Концы предложений: . ! ? … и закрывающая кавычка после них. */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    // «…» — самостоятельный конец; точку в «1.5» и инициалах не считаем.
    if (ch === '.' && i > 0 && /[0-9а-яa-z]\.[0-9а-яa-z]/i.test(text.slice(i - 1, i + 2))) continue;
    let end = i + 1;
    while (end < text.length && /["»')\]]/.test(text[end])) end++;
    if (end === text.length || /\s/.test(text[end])) ends.push(end);
  }
  return ends;
}

const stripTail = (s: string) => s.replace(/[,;:—\-–\s]+$/, '').trim();

/**
 * Обрезать до `max` символов по границе предложения.
 *  - текст короче `max` → возвращается как есть;
 *  - влезает хотя бы одно предложение → по конец последнего влезшего (без «…»);
 *  - первое предложение длиннее `max` → по границе слова + «…».
 */
export function clampToSentence(text: string, max = 160): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;

  const ends = sentenceEnds(t).filter((e) => e <= max);
  if (ends.length) return t.slice(0, ends[ends.length - 1]).trim();

  const raw = t.slice(0, max);
  const lastSpace = raw.lastIndexOf(' ');
  return `${stripTail(lastSpace > max * 0.6 ? raw.slice(0, lastSpace) : raw)}…`;
}

/** Заголовок тайтла для title/og/twitter: год добавляем, только если его ещё нет
 *  в названии. После разбора дублей (scripts/repair-catalog.mjs --fix-dupes) русское
 *  название само содержит год («Ван-Пис (1999)»), и прежний шаблон давал
 *  «Ван-Пис (1999) (1999) смотреть онлайн». */
export function titleWithYear(name: string, year?: number | null): string {
  const n = (name ?? '').trim();
  if (!year || year <= 0) return n;
  return n.includes(`(${year})`) ? n : `${n} (${year})`;
}

/**
 * meta description страницы тайтла: 150–160 символов, граница предложения.
 * Формат из ТЗ: «{Название} ({год}) — {жанры}. {описание}. {хвост}»
 */
export function titleMetaDescription(opts: {
  name: string;
  year?: number | null;
  genres?: string[];
  description?: string | null;
  tail?: string;
  min?: number;
  max?: number;
}): string {
  const min = opts.min ?? 150;
  const max = opts.max ?? 160;
  const genres = opts.genres?.length ? ` — ${opts.genres.join(', ')}` : '';
  const head = `${titleWithYear(opts.name, opts.year)}${genres}.`;
  const tail = opts.tail ?? 'Смотреть онлайн, расписание выхода серий и озвучки на AniNova';
  const body = (opts.description ?? '').replace(/\s+/g, ' ').trim();

  /* Жадный набор ЦЕЛЫХ предложений до предела max: никогда не режем посреди фразы
     (главный критерий ТЗ 1.4), а вилка min…max достигается настолько близко,
     насколько позволяет длина первого предложения. */
  const ends = sentenceEnds(body);
  let acc = '';
  for (const end of ends) {
    const candidate = body.slice(0, end).trim();
    if (`${head} ${candidate}`.length > max) break;
    acc = candidate;
    if (`${head} ${acc}`.length >= min) break;
  }
  // Ни одно предложение не влезло целиком — режем первое по границе слова.
  if (!acc && body) acc = stripTail(body.slice(0, Math.max(0, max - head.length - 2)));

  const text = acc ? `${head} ${acc}`.trim() : head;
  if (text.length < min) {
    const withTail = `${text} ${tail}.`;
    if (withTail.length <= max) return withTail;
  }
  return text.length > max ? clampToSentence(text, max) : text;
}
