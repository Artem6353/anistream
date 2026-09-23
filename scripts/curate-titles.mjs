/* Кураторский скрипт (ТЗ 4.3):
   node scripts/curate-titles.mjs missing          — список тайтлов без источников (по warm-summary)
   node scripts/curate-titles.mjs remove <slug...>  — убрать тайтлы из каталога (битые/ненужные)
   Ручные источники добавляются правкой lib/data/manual-sources.json (формат в комментарии registry). */
import { readFileSync, writeFileSync } from 'node:fs';
const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'missing') {
  const warm = JSON.parse(readFileSync('.cache/warm-summary.json', 'utf8'));
  const miss = warm.rows.filter((r) => !r.ok);
  console.log(`без источников: ${miss.length}`);
  miss.forEach((r) => console.log(' -', r.slug));
} else if (cmd === 'remove') {
  const titles = JSON.parse(readFileSync('lib/data/titles.json', 'utf8'));
  const drop = new Set(args);
  const next = titles.filter((t) => !drop.has(t.slug));
  writeFileSync('lib/data/titles.json', JSON.stringify(next));
  console.log(`удалено ${titles.length - next.length}, осталось ${next.length}`);
} else {
  console.log('usage: curate-titles.mjs missing | remove <slug...>');
}
