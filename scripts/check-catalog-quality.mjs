/* Контроль качества данных каталога (аудит 2026-10, задача 2).
 *
 * Зачем: sync-catalog.yml каждые 6 часов добавляет новые тайтлы и коммитит
 * lib/data/titles.json. Новые записи приходят из AniList/Jikan «сырыми», поэтому
 * без контроля в каталог постепенно вернулись бы те же дефекты, которые чинил
 * repair-catalog.mjs: заглушки числа серий, описания оборванные посреди слова,
 * лицензиары в студиях, одинаковые названия у разных лет.
 *
 * Режимы:
 *   node scripts/check-catalog-quality.mjs          # отчёт (всегда exit 0, кроме --gate)
 *   node scripts/check-catalog-quality.mjs --gate   # предохранитель перед коммитом:
 *                                                   # при превышении порога exit 1
 *
 * Что важно про пороги. Они выставлены по ИЗМЕРЕННОМУ состоянию каталога после
 * repair-catalog.mjs (12.10.2026), а не «в вакууме», иначе предохранитель либо
 * блокировал бы каждый прогон, либо ничего не ловил:
 *
 *   метрика                                   сейчас   порог
 *   описания, оборванные посреди слова         6,31 %   10 %   (по ТЗ)
 *   заглушки 12/24, ОПРОВЕРГНУТЫЕ графиком     0        1 %    (по ТЗ)
 *   заглушки 12/24 у анонсов                   0,40 %   1 %    (по ТЗ)
 *   лицензиары/продюсеры в studios             0        0,5 %  (по ТЗ — 1 %, но сейчас 0)
 *   одинаковые названия у тайтлов РАЗНЫХ лет   0,07 %   1 %    (по ТЗ)
 *   падение числа тайтлов относительно git     —        2 %    (по ТЗ)
 *
 * Отдельно про «заглушки у онгоингов»: их в каталоге 114 (1,42 %), но это НЕ дефект —
 * у этих тайтлов нет ни airing, ни epdates, то есть опровергнуть 12/24 нечем,
 * и lib/episodes.ts показывает их как «вышло N, итог неизвестен». Ломается только
 * заглушка, противоречащая графику эфира (aired > stated): таких после ремонта 0,
 * и именно их ловит порог.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { NOT_ANIMATION_STUDIOS } from './lib/studios.mjs';
import { isTruncatedDescription } from './lib/text.mjs';

const argv = process.argv.slice(2);
const GATE = argv.includes('--gate');
const FILE = process.env.TITLES_FILE ?? 'lib/data/titles.json';
const argVal = (name, dflt) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split('=')[1] : dflt;
};

/* Пороги в процентах от числа тайтлов. Перекрываются переменными окружения. */
const THRESHOLDS = {
  truncatedPct: Number(process.env.QC_TRUNCATED_PCT ?? argVal('truncated-pct', 10)),
  stubOngoingPct: Number(process.env.QC_STUB_ONGOING_PCT ?? argVal('stub-ongoing-pct', 1)),
  stubUpcomingPct: Number(process.env.QC_STUB_UPCOMING_PCT ?? argVal('stub-upcoming-pct', 1)),
  licensorPct: Number(process.env.QC_LICENSOR_PCT ?? argVal('licensor-pct', 0.5)),
  dupNamePct: Number(process.env.QC_DUP_NAME_PCT ?? argVal('dup-name-pct', 1)),
  countDropPct: Number(process.env.QC_COUNT_DROP_PCT ?? argVal('count-drop-pct', 2)),
};

/** Легитимные хвосты: атрибуция источника, а не обрыв предложения. */
const LEGIT_TAIL = /(©|\(Source:|Source:|公式サイト|Official Site|\betc\.)\s*$/i;

const titles = JSON.parse(readFileSync(FILE, 'utf8'));
const N = titles.length;
const pct = (n) => (100 * n) / N;
const fmt = (x) => `${x.toFixed(2)}%`;

/* --- 1) заглушки числа серий, опровергнутые реальным графиком --- */
const maxKnown = (t) => {
  let max = 0;
  for (const a of t.airing ?? []) if (a.ep > max) max = a.ep;
  if (t.epdates) for (const k of Object.keys(t.epdates)) { const n = Number(k); if (n > max) max = n; }
  return max;
};
const stubOngoingContradicted = titles.filter((t) => {
  if (t.status !== 'ongoing') return false;
  const eps = t.episodes;
  return (eps === 12 || eps === 24) && maxKnown(t) > eps;
});
const stubUpcoming = titles.filter((t) => t.status === 'upcoming' && (t.episodes === 12 || t.episodes === 24));
const stubOngoingUnproven = titles.filter(
  (t) => t.status === 'ongoing' && (t.episodes === 12 || t.episodes === 24) && maxKnown(t) <= (t.episodes ?? 0),
);

/* --- 2) описания, оборванные посреди слова --- */
const truncated = titles.filter((t) => t.description && isTruncatedDescription(t.description) && !LEGIT_TAIL.test(t.description.trim()));
const needsRefresh = titles.filter((t) => t.needsDescriptionRefresh);

/* --- 3) лицензиары/продюсеры вместо студий --- */
const licensors = titles.filter((t) => (t.studios ?? []).some((s) => NOT_ANIMATION_STUDIOS.has(String(s).trim().toLowerCase())));

/* --- 4) одинаковые отображаемые названия у тайтлов РАЗНЫХ лет --- */
const byName = new Map();
for (const t of titles) {
  const key = (t.ru ?? '').trim();
  if (!key) continue;
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(t);
}
let dupDiffYear = 0;
let dupSameYear = 0;
const dupSamples = [];
for (const [name, list] of byName) {
  if (list.length < 2) continue;
  const years = new Set(list.map((t) => t.year).filter((y) => y > 0));
  if (years.size === list.length) {
    dupDiffYear += list.length;
    if (dupSamples.length < 5) dupSamples.push(`«${name}»: ${list.map((t) => `${t.year}/${t.slug}`).join(', ')}`);
  } else {
    dupSameYear += list.length;
  }
}

/* --- 5) падение числа тайтлов относительно последней версии в git --- */
function countFromGit() {
  try {
    const raw = execSync(`git show HEAD:${FILE}`, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null; // нет git или файла в HEAD — проверку пропускаем
  }
}
const prevCount = GATE ? countFromGit() : null;
const dropPct = prevCount ? (100 * (prevCount - N)) / prevCount : 0;

/* --------------------------------- отчёт --------------------------------- */

const rows = [
  {
    name: 'заглушки 12/24 у онгоингов, опровергнутые графиком',
    count: stubOngoingContradicted.length,
    pct: pct(stubOngoingContradicted.length),
    limit: THRESHOLDS.stubOngoingPct,
    samples: stubOngoingContradicted.slice(0, 5).map((t) => `${t.slug}: episodes=${t.episodes}, вышло=${maxKnown(t)}`),
  },
  {
    name: 'заглушки 12/24 у анонсов',
    count: stubUpcoming.length,
    pct: pct(stubUpcoming.length),
    limit: THRESHOLDS.stubUpcomingPct,
    samples: stubUpcoming.slice(0, 5).map((t) => `${t.slug} (${t.year})`),
  },
  {
    name: 'описания, оборванные посреди слова',
    count: truncated.length,
    pct: pct(truncated.length),
    limit: THRESHOLDS.truncatedPct,
    samples: truncated.slice(0, 5).map((t) => `${t.slug}: «…${t.description.slice(-28)}»`),
  },
  {
    name: 'лицензиары/продюсеры в studios',
    count: licensors.length,
    pct: pct(licensors.length),
    limit: THRESHOLDS.licensorPct,
    samples: licensors.slice(0, 5).map((t) => `${t.slug}: ${JSON.stringify(t.studios)}`),
  },
  {
    name: 'одинаковые названия у тайтлов разных лет',
    count: dupDiffYear,
    pct: pct(dupDiffYear),
    limit: THRESHOLDS.dupNamePct,
    samples: dupSamples,
  },
];

console.log(`=== Качество каталога: ${FILE} (${N} тайтлов) ===`);
let failed = 0;
for (const r of rows) {
  const bad = GATE && r.pct > r.limit;
  if (bad) failed++;
  console.log(`${bad ? 'FAIL' : GATE ? 'ok  ' : '    '} ${r.name}: ${r.count} (${fmt(r.pct)})${GATE ? `, порог ${fmt(r.limit)}` : ''}`);
  if (r.samples.length && (bad || !GATE)) for (const s of r.samples.slice(0, bad ? 10 : 3)) console.log(`        · ${s}`);
}

if (GATE && prevCount) {
  const bad = dropPct > THRESHOLDS.countDropPct;
  if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'ok  '} число тайтлов: ${prevCount} → ${N} (${dropPct >= 0 ? '−' : '+'}${fmt(Math.abs(dropPct))}), порог −${fmt(THRESHOLDS.countDropPct)}`);
} else if (GATE) {
  console.log('      число тайтлов: предыдущая версия в git недоступна — проверка пропущена');
}

/* Справочно, без порога: то, что чинится только сетевым проходом. */
console.log('');
console.log(`справочно (порогов нет):`);
console.log(`  · помечено к перечитыванию описания из Shikimori: ${needsRefresh.length} (--fix-desc-net)`);
console.log(`  · заглушки 12/24 у онгоингов без графика (не опровергнуть): ${stubOngoingUnproven.length}`);
console.log(`  · одинаковые названия у тайтлов ОДНОГО года (серия vs OVA/спешл): ${dupSameYear}`);

if (!GATE) process.exit(0);
if (failed) {
  console.error('');
  console.error(`::error::CATALOG QUALITY GATE: ${failed} метрик выше порога — коммит отменён.`);
  console.error('Запустите ремонт и повторите:');
  console.error('  node scripts/repair-catalog.mjs --fix-episodes --fix-desc --fix-dupes --fix-studios --apply');
  console.error('Если дефект пришёл из источника, чините импортёр (scripts/expand-catalog.mjs,');
  console.error('scripts/fetch-jikan.mjs), а не данные вручную.');
  process.exit(1);
}
console.log('');
console.log('gate пройден: каталог можно коммитить');
