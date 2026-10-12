/**
 * Индексация разделов без контента (аудит 2026-10, ТЗ 1.7.4).
 *
 * Лента, клубы и форум на проде фактически пустые, но отдают полноценные HTML-страницы.
 * Google расценивает их как тонкий контент и понижает оценку хоста. Правило:
 * раздел индексируется, когда записей не меньше порога (по умолчанию 10), иначе noindex.
 * Порог проверяется по данным БД, поэтому индексация вернётся АВТОМАТИЧЕСКИ,
 * как только в разделе появится жизнь — правки кода не потребуется.
 */

const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const SECTION_INDEX_THRESHOLD = Number(process.env.SECTION_INDEX_THRESHOLD ?? 10);

export type SectionKey = 'feed' | 'clubs' | 'forum' | 'reviews';

/* Таблица-прокси для каждого раздела. Отдельной таблицы у ленты нет: она
   собирается из отзывов и постов, поэтому считаем по отзывам. */
const TABLES: Record<SectionKey, string> = {
  feed: 'reviews',
  clubs: 'clubs',
  forum: 'forum_threads',
  reviews: 'reviews',
};

/** Сколько записей в таблице раздела. null — БД не настроена/недоступна. */
async function countRows(table: string): Promise<number | null> {
  if (!SUPA_URL || !SUPA_ANON) return null;
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=id&limit=1000`, {
      headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}`, Range: '0-999' },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) ? rows.length : null;
  } catch {
    return null;
  }
}

/**
 * Индексировать ли раздел. Без БД считаем, что контента нет (noindex) — это безопаснее:
 * пустая страница в индексе вредит больше, чем временно закрытая наполненная.
 */
export async function sectionIndexable(section: SectionKey): Promise<boolean> {
  const count = await countRows(TABLES[section]);
  if (count === null) return false;
  return count >= SECTION_INDEX_THRESHOLD;
}

/** Мета-тег robots для раздела: порог из ТЗ 1.7.4. */
export async function sectionRobots(section: SectionKey): Promise<{ index: boolean; follow: boolean }> {
  return { index: await sectionIndexable(section), follow: true };
}
