/* Чистка мойибаке и артефактов в названиях/описаниях (handoff A4.3):
   node scripts/clean-titles.mjs report  — найти артефакты (HTML-теги, &amp;/&#039;, двойные пробелы, мойибаке), ничего не менять
   node scripts/clean-titles.mjs fix     — очистить поля ru/romaji/en/description и перезаписать lib/data/titles.json
   После fix каталог подхватит изменения автоматически (mtime-инвалидация lib/catalog.ts). */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'lib/data/titles.json';
const FIELDS = ['ru', 'romaji', 'en', 'description'];
const mode = process.argv[2] || 'report';

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#39;': "'",
  '&laquo;': '«', '&raquo;': '»', '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
  '&nbsp;': ' ', '&quot': '"',
};
// частые следствия двойной UTF-8-кодировки (windows-1251/1252 поверх UTF-8)
const MOJIBAKE = /Ð[^\s]|Ñ[^\s]|Â[\s—–]|â€[œ“”™˜¦¢]/;

const ARTIFACTS = [
  { name: 'html-тег', re: /<\/?[a-z][^>]*>/i, fields: ['description'] }, // в названиях <DOGEZA>, <<Fruitmaster>> — часть официальных имён
  { name: 'html-entity', re: /&(?:[a-z]+|#0?\d+);/i }, // только настоящие entity с «;»: &amp; &#039; (легитимные XY&Z, A&R не трогаем)
  { name: 'двойной пробел', re: / {2,}/ },
  { name: 'контрольный символ', re: /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/ },
  { name: 'мойибаке', re: MOJIBAKE },
];

function detect(field, s) {
  if (typeof s !== 'string') return [];
  return ARTIFACTS.filter((a) => (!a.fields || a.fields.includes(field)) && a.re.test(s)).map((a) => a.name);
}

function clean(field, s) {
  if (typeof s !== 'string') return s;
  let out = s;
  if (field === 'description') {
    out = out.replace(/<br\s*\/?>/gi, ' ').replace(/<\/?[a-z][^>]*>/gi, ''); // теги — только в описаниях
  }
  for (const [ent, ch] of Object.entries(ENTITIES)) out = out.replaceAll(ent, ch);
  out = out.replace(/&#0?(\d+);/g, (_m, code) => {
    const n = Number(code);
    return n >= 32 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
  out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); // контрольные
  out = out.replace(/[ \t]{2,}/g, ' '); // двойные пробелы
  return out.trim();
}

const titles = JSON.parse(readFileSync(FILE, 'utf8'));
const hits = [];
for (const t of titles) {
  const found = {};
  for (const f of FIELDS) {
    const d = detect(f, t[f]);
    if (d.length) found[f] = d;
  }
  if (Object.keys(found).length) hits.push({ slug: t.slug, found, sample: String(t.description || t.ru || '').slice(0, 90) });
}

console.log(`просканировано ${titles.length} тайтлов, с артефактами: ${hits.length}`);
for (const h of hits.slice(0, 20)) {
  console.log(` - ${h.slug}: ${JSON.stringify(h.found)} | ${h.sample}`);
}
if (hits.length > 20) console.log(` … и ещё ${hits.length - 20}`);

if (mode === 'fix') {
  let changed = 0;
  for (const t of titles) {
    for (const f of FIELDS) {
      const c = clean(f, t[f]);
      if (c !== t[f]) { t[f] = c; changed++; }
    }
  }
  writeFileSync(FILE, JSON.stringify(titles));
  console.log(`исправлено полей: ${changed}. Файл перезаписан — каталог обновится по mtime.`);
} else if (hits.length) {
  console.log('\nзапустите «node scripts/clean-titles.mjs fix», чтобы очистить.');
} else {
  console.log('артефактов нет ✓ (выборка чистая)');
}
