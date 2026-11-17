/**
 * Дедупликация строк перед UPSERT (финальный QA-аудит 2026-11-17).
 *
 * PostgREST/Postgres отвечает 500 `21000: ON CONFLICT DO UPDATE command cannot
 * affect row a second time`, если в одном INSERT ... ON CONFLICT пачке встречаются
 * две строки с одинаковым конфликтным ключом. Инцидент: `import-titles-to-db.mjs`
 * падал на `title_relations`, потому что в каталоге один и тот же связанный тайтл
 * встречается дважды (разные типы связи: sequel + side story) — а первичный ключ
 * там `(anime_id, related_id)`.
 *
 * Схема безопасна тем, что порядок сохраняется и «выживает» первая строка: она
 * ближе всего к порядку каталога, а более поздние дубли несут ту же информацию.
 */

/**
 * @param rows строки для вставки
 * @param keys колонки первичного/уникального ключа (порядок не важен)
 * @returns {rows: any[], dropped: number} уникальные строки и сколько отброшено
 */
export function dedupeByKeys(rows, keys) {
  if (!Array.isArray(rows) || rows.length === 0) return { rows: [], dropped: 0 };
  if (!Array.isArray(keys) || keys.length === 0) return { rows, dropped: 0 };

  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    // \u0001 не встречается в данных и не даёт коллизий вида «a|b» vs «a|b|c».
    const key = keys.map((column) => String(row?.[column] ?? '')).join('\u0001');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return { rows: unique, dropped: rows.length - unique.length };
}
