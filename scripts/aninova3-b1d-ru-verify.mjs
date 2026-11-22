#!/usr/bin/env node
/**
 * B1-D: проверка качества кандидатов русских метаданных.
 *
 *   node scripts/aninova3-b1d-ru-verify.mjs               # статическая проверка файлов
 *   node scripts/aninova3-b1d-ru-verify.mjs --refetch=40   # + сверка выборки с Shikimori
 *
 * Ничего не публикует и не меняет данные: только читает и пишет отчёт
 * docs/data/aninova3-b1d-ru-verification.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GRAPH = path.join(ROOT, 'lib', 'aninova3', 'comics', 'source-graph.json');
const RUNTIME = path.join(ROOT, 'lib', 'aninova3', 'comics', 'metadata-candidates.json');
const FULL = path.join(ROOT, 'docs', 'data', 'aninova3-b1c-metadata-candidates.json');
const OUT = path.join(ROOT, 'docs', 'data', 'aninova3-b1d-ru-verification.json');
const UA = { 'User-Agent': 'AniNova/3.0 B1-D ru-metadata check', Accept: 'application/json' };

const args = process.argv.slice(2);
const val = (n, d) => {
  const eq = args.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const REFETCH = Number(val('refetch', 0));
const SEED = Number(val('seed', 20261122));

const readJson = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};

/** Детерминированная выборка, чтобы прогон был воспроизводимым. */
function sample(rows, n) {
  if (n <= 0 || rows.length <= n) return rows;
  let state = SEED;
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const pool = [...rows];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

async function main() {
  const { validateCandidates } = await import('../lib/aninova3/comics/candidate-validation.ts').catch(async () => {
    /* Node без разрешения .ts запускает через tsx-подобный loader; если его нет,
       используем уже собранную копию логики через vitest — см. npm run ru:verify. */
    return await import('file:///' + path.join(ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs')).catch(() => ({}));
  });

  const graph = readJson(GRAPH, { comics: [] });
  const runtime = readJson(RUNTIME, { candidates: [] });
  const full = readJson(FULL, { candidates: [] });

  const comics = new Map(graph.comics.map((c) => [c.anilist, { externalIds: { anilist: c.anilist, mal: c.mal ?? null }, year: c.year ?? null }]));

  const runtimeRows = (runtime.candidates ?? []).map((c) => ({ ...c, verification: c.verification ?? 'CANDIDATE' }));
  const fullRows = full.candidates ?? [];

  if (typeof validateCandidates !== 'function') {
    console.error('[b1d] не удалось загрузить валидатор (нужен tsx) — используйте `node --experimental-strip-types`');
    process.exitCode = 1;
    return;
  }

  const runtimeResult = validateCandidates(runtimeRows, comics);
  const fullResult = validateCandidates(fullRows, comics);

  /* Сверка выборки с источником: тот же id обязан дать те же название/MAL/URL. */
  const refetch = { requested: REFETCH, checked: 0, mismatches: [], failed: [] };
  if (REFETCH > 0) {
    for (const row of sample(runtimeRows, REFETCH)) {
      try {
        const res = await fetch(`https://shikimori.one/api/mangas/${row.mal}`, { headers: UA });
        if (!res.ok) {
          refetch.failed.push({ anilist: row.anilist, mal: row.mal, status: res.status });
          continue;
        }
        const data = await res.json();
        refetch.checked += 1;
        const diffs = [];
        if (Number(data.id) !== Number(row.mal)) diffs.push('id');
        if ((data.myanimelist_id ?? null) !== null && Number(data.myanimelist_id) !== Number(row.mal)) diffs.push('myanimelist_id');
        if ((data.russian ?? null) !== (row.titleRu ?? null)) diffs.push('russian');
        if ((data.name ?? null) !== (row.name ?? null)) diffs.push('name');
        if (diffs.length) {
          refetch.mismatches.push({
            anilist: row.anilist,
            mal: row.mal,
            fields: diffs,
            stored: { titleRu: row.titleRu, name: row.name },
            source: { russian: data.russian ?? null, name: data.name ?? null, myanimelistId: data.myanimelist_id ?? null },
          });
        }
      } catch (err) {
        refetch.failed.push({ anilist: row.anilist, mal: row.mal, error: err.message });
      }
      await new Promise((r) => setTimeout(r, 450));
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: {
      runtime: path.relative(ROOT, RUNTIME),
      full: path.relative(ROOT, FULL),
      graphComics: graph.comics.length,
    },
    runtimeCandidates: {
      checked: runtimeResult.checked,
      problems: runtimeResult.problems.length,
      problemSample: runtimeResult.problems.slice(0, 50),
      stats: runtimeResult.stats,
    },
    fullCandidates: {
      checked: fullResult.checked,
      problems: fullResult.problems.length,
      problemSample: fullResult.problems.slice(0, 50),
      stats: { ...fullResult.stats, duplicateTitles: fullResult.stats.duplicateTitles.slice(0, 20) },
    },
    refetch,
    note:
      'CANDIDATE ≠ VERIFIED. Проверка подтверждает целостность и происхождение данных, ' +
      'но не делает их подтверждёнными и не даёт прав на публикацию.',
  };

  console.log(`[b1d] кандидатов: ${runtimeResult.checked} (полный отчёт ${fullResult.checked}); проблем: ${runtimeResult.problems.length}`);
  console.log(`[b1d] русских названий ${runtimeResult.stats.withCyrillicTitle}, лицензий ${runtimeResult.stats.withLicenseName}, описаний ${runtimeResult.stats.withDescription}, непереведённых ${runtimeResult.stats.untranslatedTitle}`);
  console.log(`[b1d] повторяющихся названий: ${runtimeResult.stats.duplicateTitles.length}, MAL-расхождений: ${runtimeResult.stats.malMismatch}`);
  if (REFETCH > 0) console.log(`[b1d] сверка с Shikimori: проверено ${refetch.checked}, расхождений ${refetch.mismatches.length}, ошибок ${refetch.failed.length}`);
  if (runtimeResult.problems.length) console.log('[b1d] примеры проблем:', JSON.stringify(runtimeResult.problems.slice(0, 5)));

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[b1d] записано: ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error('[b1d] ошибка:', err.message);
  process.exitCode = 1;
});
