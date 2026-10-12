/* Общая обрезка текста для скриптов импорта (ESM-версия lib/text.ts).
 *
 * Аудит 2026-10 (ТЗ 1.4): импортёры резали описания жёстко по символам —
 * `clean(desc).slice(0, 900)` в enrich-shikimori-resumable.mjs и `.slice(0, 400)`
 * в expand-catalog.mjs. В каталоге 1784 описания из 8017 обрывались посреди слова
 * («…никогда не угадаешь, куда тебя»), и это же попадало в meta description.
 *
 * Важно: скрипты — это .mjs без TS, поэтому здесь обычный JS. Алгоритм идентичен
 * lib/text.ts; если меняете один — меняйте и второй (или выносите в общий .mjs).
 */

/** Концы предложений: . ! ? … и закрывающая кавычка/скобка после них. */
export function sentenceEnds(text) {
  const ends = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    // точку в «8.7» и инициалах концом предложения не считаем
    if (ch === '.' && i > 0 && /[0-9а-яa-z]\.[0-9а-яa-z]/i.test(text.slice(i - 1, i + 2))) continue;
    let end = i + 1;
    while (end < text.length && /["»')\]]/.test(text[end])) end++;
    if (end === text.length || /\s/.test(text[end])) ends.push(end);
  }
  return ends;
}

const stripTail = (s) => s.replace(/[,;:—\-–\s]+$/, '').trim();

/** Обрезать до `max` символов по границе предложения; слово не рвём. */
export function clampToSentence(text, max = 900) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  const ends = sentenceEnds(t).filter((e) => e <= max);
  if (ends.length) return t.slice(0, ends[ends.length - 1]).trim();
  const raw = t.slice(0, max);
  const sp = raw.lastIndexOf(' ');
  return `${stripTail(sp > max * 0.6 ? raw.slice(0, sp) : raw)}…`;
}

/** Описание оборвано посреди предложения (признак того, что его резал импортёр). */
export function isTruncatedDescription(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  return !/[.!?…]["»')\]]?$/.test(t);
}
