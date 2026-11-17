#!/usr/bin/env node
/* P1-2: контроль объёма базы Supabase (квота Free — 500 МБ).
 *
 * Зачем: `episode_source_urls` растёт с каждой гидрацией (~90–150 байт на серию,
 * до 1200 серий на озвучку). Когда квота кончится, запись начнёт падать — а
 * узнаём мы об этом уже по пустым источникам на сайте.
 *
 * Точный размер берём из RPC `db_storage_report()` (миграция
 * supabase/migrations/20261118_db_storage_report.sql, отдаёт pg_database_size).
 * Если миграция ещё не применена (PostgREST отвечает 404), скрипт честно
 * переключается на оценку по строкам и помечает отчёт `exact: false` — чтобы
 * никто не принял приблизительные числа за факт.
 *
 * Usage:
 *   node scripts/check-db-size.mjs
 *   node scripts/check-db-size.mjs --summary .cache/db-size.txt
 *
 * Коды выхода: 0 — в норме, 3 — превышен порог алерта, 1 — критично или ошибка.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_QUOTA_MB = 500;
const DEFAULT_ALERT_PCT = 80;
const DEFAULT_CRITICAL_PCT = 95;
const SAMPLE_ROWS = 50;
const NL = String.fromCharCode(10);

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  return values;
}

const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
const configValue = (key) => process.env[key] ?? env[key];

const args = process.argv.slice(2);
const argValue = (name) => {
  const eq = args.find((arg) => arg.startsWith('--' + name + '='));
  if (eq) return eq.slice(name.length + 3);
  const index = args.indexOf('--' + name);
  return index >= 0 ? args[index + 1] : undefined;
};
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/check-db-size.mjs [--summary PATH] [--output PATH]');
  console.log('Env: NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL, SUPABASE_SERVICE_KEY,');
  console.log('     SUPABASE_DB_QUOTA_MB (500), DB_SIZE_ALERT_PCT (80), DB_SIZE_CRITICAL_PCT (95)');
  process.exit(0);
}

const BASE = (configValue('NEXT_PUBLIC_SUPABASE_URL') ?? configValue('SUPABASE_URL') ?? '').replace(/\/$/, '');
const KEY = configValue('SUPABASE_SERVICE_KEY') ?? '';
const quotaMb = Number(configValue('SUPABASE_DB_QUOTA_MB') ?? DEFAULT_QUOTA_MB);
const alertPct = Number(configValue('DB_SIZE_ALERT_PCT') ?? DEFAULT_ALERT_PCT);
const criticalPct = Number(configValue('DB_SIZE_CRITICAL_PCT') ?? DEFAULT_CRITICAL_PCT);
const outputPath = path.resolve(argValue('output') ?? '.cache/db-size-report.json');
const summaryPath = argValue('summary') ? path.resolve(argValue('summary')) : null;

const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, Accept: 'application/json' };
const mb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;

async function daysSince(isoDate) {
  const at = Date.parse(isoDate ?? '');
  if (!Number.isFinite(at)) return null;
  return Math.round((Date.now() - at) / 86_400_000);
}

/** Точный размер через RPC. null — функция не применена (или нет прав). */
export async function readExactSize(options = {}) {
  const baseUrl = options.baseUrl ?? BASE;
  const requestHeaders = options.headers ?? headers;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(baseUrl + '/rest/v1/rpc/db_storage_report', {
    method: 'POST',
    headers: { ...requestHeaders, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404 || response.status === 400 || response.status === 403) {
    return { exact: false, reason: 'HTTP ' + response.status + ' (миграция db_storage_report не применена?)' };
  }
  if (!response.ok) throw new Error('db_storage_report HTTP ' + response.status);
  const body = await response.json();
  const databaseBytes = Number(body?.databaseBytes ?? body?.database_bytes);
  if (!Number.isFinite(databaseBytes) || databaseBytes <= 0) {
    return { exact: false, reason: 'RPC вернул пустой ответ' };
  }
  const tables = Array.isArray(body?.tables) ? body.tables : [];
  return {
    exact: true,
    databaseBytes,
    tables: tables
      .map((table) => ({ name: String(table?.name ?? '?'), bytes: Number(table?.bytes ?? 0) }))
      .filter((table) => Number.isFinite(table.bytes))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

/** Оценка без RPC: количество строк × средний размер строки по выборке. */
export async function estimateTable(table, options = {}) {
  const baseUrl = options.baseUrl ?? BASE;
  const requestHeaders = options.headers ?? headers;
  const fetchImpl = options.fetchImpl ?? fetch;
  const head = await fetchImpl(baseUrl + '/rest/v1/' + table + '?select=*&limit=1', {
    headers: { ...requestHeaders, Prefer: 'count=exact', Range: '0-0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!head.ok) throw new Error(table + ' HTTP ' + head.status);
  const range = head.headers.get('content-range') ?? '';
  const count = Number(range.split('/')[1]);
  const sampleResponse = await fetchImpl(baseUrl + '/rest/v1/' + table + '?select=*', {
    headers: { ...requestHeaders, Range: '0-' + (SAMPLE_ROWS - 1) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!sampleResponse.ok) throw new Error(table + ' sample HTTP ' + sampleResponse.status);
  const sample = await sampleResponse.json();
  const rows = Array.isArray(sample) ? sample : [];
  if (!rows.length || !Number.isFinite(count)) return { name: table, bytes: 0, rows: 0, sampled: 0 };
  const avgBytes = rows.reduce((sum, row) => sum + JSON.stringify(row).length, 0) / rows.length;
  // Postgres хранит строку плотнее JSON (накладные расходы страниц ≈ +25%), но порядок верный.
  return { name: table, bytes: Math.round(count * avgBytes * 1.25), rows: count, sampled: rows.length };
}

/**
 * Расчёт отчёта и вердикта — чистая функция (тестируется в tests/db-size.test.ts).
 * @returns {{report: object, verdict: 'ok'|'alert'|'critical'}}
 */
export function buildReport(input) {
  const {
    databaseBytes,
    quotaMb,
    alertPct,
    criticalPct,
    tables = [],
    exact = true,
    exactReason = null,
    newestSourceAgeDays = null,
  } = input;
  const quotaBytes = (Number.isFinite(quotaMb) && quotaMb > 0 ? quotaMb : DEFAULT_QUOTA_MB) * 1024 * 1024;
  const usedPct = Math.round((databaseBytes / quotaBytes) * 1000) / 10;
  const thresholdPct = Number.isFinite(alertPct) && alertPct > 0 ? alertPct : DEFAULT_ALERT_PCT;
  const critical = Number.isFinite(criticalPct) && criticalPct > 0 ? criticalPct : DEFAULT_CRITICAL_PCT;
  const report = {
    generatedAt: new Date().toISOString(),
    exact,
    exactReason,
    databaseBytes,
    databaseMb: mb(databaseBytes),
    quotaMb: Math.round(quotaBytes / 1024 / 1024),
    usedPct,
    thresholdPct,
    criticalPct: critical,
    overThreshold: usedPct >= thresholdPct,
    overCritical: usedPct >= critical,
    freeMb: Math.round((quotaBytes - databaseBytes) / 1024 / 1024),
    newestSourceAgeDays,
    tables: tables.map((table) => ({
      name: table.name,
      mb: mb(table.bytes),
      rows: Number(table.rows ?? 0) || null,
    })),
  };
  const verdict = report.overCritical ? 'critical' : report.overThreshold ? 'alert' : 'ok';
  return { report, verdict };
}

async function main() {
  if (!BASE || !KEY) {
    console.error('Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_KEY (env или .env.local).');
    process.exit(1);
  }

  const exact = await readExactSize();
  let tables = [];
  let databaseBytes = exact.exact ? exact.databaseBytes : 0;

  if (!exact.exact) {
    console.log('Точный размер недоступен (' + exact.reason + ') — считаю оценку по строкам.');
    for (const table of ['episode_source_urls', 'episode_sources', 'titles']) {
      try {
        tables.push(await estimateTable(table));
      } catch (error) {
        console.log('  ' + table + ': пропуск (' + (error instanceof Error ? error.message : String(error)) + ')');
      }
    }
    const payloadBytes = tables.reduce((sum, table) => sum + table.bytes, 0);
    // Оценка всей БД: служебные схемы/индексы/бloat ≈ 2× от полезных данных.
    databaseBytes = Math.round(payloadBytes * 2);
  } else {
    tables = exact.tables;
  }

  // Свежесть источников: если гидрация встала, место перестанет расти — но и данные
  // перестанут обновляться. Один запрос, чтобы это было видно в том же отчёте.
  let newestSourceAgeDays = null;
  try {
    const newest = await fetch(
      BASE + '/rest/v1/episode_source_urls?select=checked_at&order=checked_at.desc&limit=1',
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    if (newest.ok) {
      const rows = await newest.json();
      newestSourceAgeDays = Array.isArray(rows) ? await daysSince(rows[0]?.checked_at) : null;
    }
  } catch {
    /* необязательная метрика */
  }

  const { report, verdict } = buildReport({
    databaseBytes,
    quotaMb,
    alertPct,
    criticalPct,
    tables,
    exact: exact.exact,
    exactReason: exact.exact ? null : exact.reason,
    newestSourceAgeDays,
  });
  const { usedPct, thresholdPct, overThreshold, overCritical } = report;

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath + '.tmp', JSON.stringify(report, null, 2) + NL, 'utf8');
  renameSync(outputPath + '.tmp', outputPath);

  const lines = [
    'Supabase: ' + report.databaseMb + ' МБ из ' + report.quotaMb + ' МБ (' + usedPct + '%)' +
      (exact.exact ? '' : ' — оценка'),
    'Свободно: ' + report.freeMb + ' МБ · порог алерта ' + thresholdPct + '%, критический ' + report.criticalPct + '%',
  ];
  if (report.tables.length) {
    lines.push('Крупнейшие таблицы: ' + report.tables.slice(0, 3).map((table) => table.name + ' ' + table.mb + ' МБ').join(', '));
  }
  if (newestSourceAgeDays !== null) {
    lines.push('Последняя запись источника: ' + newestSourceAgeDays + ' дн. назад');
  }
  if (overCritical) lines.unshift('КРИТИЧНО: база почти заполнена');
  else if (overThreshold) lines.unshift('Внимание: база перешла порог ' + thresholdPct + '%');
  const summaryText = lines.join(NL);

  console.log(summaryText);
  console.log('Report saved: ' + outputPath);
  if (summaryPath) {
    mkdirSync(path.dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath + '.tmp', summaryText + NL, 'utf8');
    renameSync(summaryPath + '.tmp', summaryPath);
    console.log('Summary saved: ' + summaryPath);
  }

  /* exitCode, а не process.exit(): на Windows жёсткий выход при незакрытых
     fetch/AbortSignal-хендлах роняет libuv (assertion uv_handle_closing),
     и код выхода превращается в 127. На Linux разницы нет. */
  if (verdict === 'critical') process.exitCode = 1;
  else if (verdict === 'alert') process.exitCode = 3;
}

/* Прямой запуск — main(); импорт из тестов — только экспорты. */
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error('DB size check failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
