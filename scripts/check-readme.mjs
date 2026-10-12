/* Сверка «главных» чисел документации с фактическим каталогом (аудит 2026-10, ТЗ 2.4).
 *
 * Проблема: README заявлял «7962 тайтла», в другом месте того же файла было
 * «Каталог 5002 тайтла», а LIMITS.md писал «около восьми тысяч» — при фактических 8017.
 *
 * Проверяются ТОЛЬКО явные утверждения о размере всего каталога:
 *   **8017 тайтлов**            (жирное начертание в лиде README)
 *   Каталог 8017 тайтлов        (строка-утверждение)
 *   titles.json — снапшот каталога (8017 тайтлов …)
 * Числа в исторических справках, таблицах аудитов и в контексте «238 тайтлов с
 * episodes: null» намеренно не трогаем: это не утверждения о размере каталога.
 *
 * Запуск: node scripts/check-readme.mjs         # проверка (exit 1 при расхождении)
 *         node scripts/check-readme.mjs --fix   # подставить актуальное число
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = process.env.TITLES_FILE ?? 'lib/data/titles.json';
const DOCS = ['README.md', 'LIMITS.md'];
const FIX = process.argv.includes('--fix');

const titles = JSON.parse(readFileSync(FILE, 'utf8'));
const total = titles.filter((t) => !t.hidden).length;

/** Шаблоны «число + тайтл*» в позициях, где это заявка на размер всего каталога. */
const CLAIMS = [
  /\*\*(\d{3,6}) тайтл(?:а|ов|ы)\*\*/g, // лид README
  /Каталог (\d{3,6}) тайтл(?:а|ов|ы)/g, // «Каталог 5002 тайтла»
  /снапшот каталога[^\n]{0,20}?(\d{3,6}) тайтл(?:а|ов|ы)/g, // блок «Архитектура»
];

let problems = 0;
for (const doc of DOCS) {
  let text;
  try {
    text = readFileSync(doc, 'utf8');
  } catch {
    continue;
  }
  let changed = false;
  for (const re of CLAIMS) {
    text = text.replace(re, (whole, num) => {
      if (Number(num) === total) return whole;
      problems++;
      const fixed = whole.replace(num, String(total));
      console.log(`${FIX ? 'FIX ' : 'FAIL'} ${doc}: «${whole}» → «${fixed}»`);
      changed = true;
      return fixed;
    });
  }
  if (FIX && changed) writeFileSync(doc, text);
}

console.log(`\nв каталоге ${total} тайтлов (проверено по ${FILE})`);
if (problems) {
  console.log(FIX ? `${problems} заявленных числа обновлено` : `${problems} расхождений — запустите с --fix`);
  process.exit(FIX ? 0 : 1);
}
console.log('заявленные числа совпадают с каталогом');
