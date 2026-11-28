#!/usr/bin/env node
/**
 * B3-E official-announcement monitor.
 *
 * Default mode is a dry run: fetch allowlisted official feeds, detect
 * adaptation keywords, write a JSON/Markdown report and change nothing.
 *
 *   node scripts/comics-b3e-monitor.mjs
 *   node scripts/comics-b3e-monitor.mjs --source bones --out artifacts/comics-announcements
 *   node scripts/comics-b3e-monitor.mjs --candidates ./candidates.json
 *
 * Writing to Supabase requires BOTH --apply and COMICS_MONITOR_APPLY=1 plus
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Inserted rows are always
 * pending_review; this script cannot confirm an adaptation, set a confirmation
 * URL or touch comic_adaptations.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildCandidate, checkUrl, parseFeed } from './lib/comics-announcements.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CONFIG_PATH = path.join(ROOT, 'data', 'comics', 'announcement-sources.json');
const DEFAULT_OUT = path.join(ROOT, 'artifacts', 'comics-announcements');
const USER_AGENT = 'AniNovaBot/1.0 (announcement review; +https://github.com/Artem6353/anistream)';
const MAX_BATCH = 50;

function parseArgs(argv) {
  const args = {
    mode: 'dry-run',
    candidates: null,
    source: null,
    out: DEFAULT_OUT,
    timeoutMs: 15000,
    limit: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.mode = 'apply';
    else if (arg === '--dry-run') args.mode = 'dry-run';
    else if (arg === '--candidates') args.candidates = argv[++i] ?? null;
    else if (arg === '--source') args.source = argv[++i] ?? null;
    else if (arg === '--out') args.out = path.resolve(argv[++i] ?? DEFAULT_OUT);
    else if (arg === '--timeout') args.timeoutMs = Number(argv[++i] ?? 15000);
    else if (arg === '--limit') args.limit = Number(argv[++i] ?? 0) || null;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) throw new Error('--timeout must be >= 1000');
  return args;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function loadConfig() {
  const raw = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) throw new Error('no sources in config');
  const seen = new Set();
  for (const source of raw.sources) {
    if (!source.slug || !source.domain || !source.kind) throw new Error('source needs slug/domain/kind');
    if (seen.has(source.slug)) throw new Error(`duplicate source slug: ${source.slug}`);
    seen.add(source.slug);
    if (source.kind !== 'manual') {
      const check = checkUrl(source.url, source.domain);
      if (!check.ok) throw new Error(`source ${source.slug}: ${check.reason}`);
    }
  }
  return raw;
}


async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFeed(source, state, args) {
  const headers = {
    'user-agent': USER_AGENT,
    accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
  };
  if (state?.etag) headers['if-none-match'] = state.etag;
  if (state?.lastModified) headers['if-modified-since'] = state.lastModified;

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    try {
      const response = await fetch(source.url, { headers, signal: controller.signal, redirect: 'follow' });
      const finalUrl = checkUrl(response.url, source.domain);
      if (!finalUrl.ok) return { ok: false, status: response.status, error: `redirect_rejected:${finalUrl.reason}` };
      if (response.status === 304) return { ok: true, status: 304, etag: state?.etag ?? null, lastModified: state?.lastModified ?? null, items: [], unchanged: true };
      if (response.status === 429 || response.status >= 500) {
        lastError = `http_${response.status}`;
        if (attempt === 1) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10000) : 2000);
          continue;
        }
        return { ok: false, status: response.status, error: lastError };
      }
      if (!response.ok) return { ok: false, status: response.status, error: `http_${response.status}` };
      const xml = await response.text();
      const feed = parseFeed(xml);
      return {
        ok: true,
        status: response.status,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        feedTitle: feed.title,
        items: feed.items,
      };
    } catch (error) {
      lastError = error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error);
      if (attempt === 2) return { ok: false, status: null, error: lastError };
      await sleep(1000);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: null, error: lastError ?? 'unknown' };
}


function dbConfig(env) {
  const url = (env.SUPABASE_URL ?? '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return null;
  if (!/^https:\/\//.test(url)) throw new Error('SUPABASE_URL must be https');
  return { url: url.replace(/\/+$/, ''), key };
}

async function rest(db, pathname, init = {}) {
  const headers = {
    apikey: db.key,
    authorization: `Bearer ${db.key}`,
    'content-type': 'application/json',
    ...(init.headers ?? {}),
  };
  const response = await fetch(`${db.url}/rest/v1/${pathname}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`supabase ${response.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function syncSources(db, sources) {
  const rows = sources.map((source) => ({
    slug: source.slug,
    name: source.name,
    kind: source.kind,
    url: source.kind === 'manual' ? null : source.url,
    domain: source.domain,
    language: source.language ?? 'en',
    is_official: source.isOfficial !== false,
    is_enabled: source.isEnabled !== false,
  }));
  await rest(db, 'comic_announcement_sources?on_conflict=slug', {
    method: 'POST',
    headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  const slugs = sources.map((source) => source.slug).join(',');
  const stored = await rest(
    db,
    `comic_announcement_sources?select=id,slug,domain,kind,is_enabled&slug=in.(${slugs})`,
  );
  return new Map(stored.map((row) => [row.slug, row]));
}


async function applyCandidates(db, candidates, sourcesBySlug) {
  const bySlug = new Map();
  for (const candidate of candidates) {
    const list = bySlug.get(candidate.sourceSlug) ?? [];
    list.push(candidate);
    bySlug.set(candidate.sourceSlug, list);
  }
  const storedSources = await syncSources(
    db,
    [...bySlug.keys()].map((slug) => sourcesBySlug.get(slug)),
  );
  let inserted = 0;
  let duplicates = 0;
  const events = [];
  for (const [slug, list] of bySlug) {
    const source = storedSources.get(slug);
    if (!source) throw new Error(`source ${slug} missing after sync`);
    for (let offset = 0; offset < list.length; offset += MAX_BATCH) {
      const batch = list.slice(offset, offset + MAX_BATCH);
      const rows = batch.map((candidate) => ({
        source_id: source.id,
        item_key: candidate.itemKey,
        title: candidate.title,
        summary: candidate.summary,
        url: candidate.url,
        published_at: candidate.publishedAt,
        detected_keywords: candidate.detectedKeywords,
        status: 'pending_review',
        content_hash: candidate.contentHash,
        raw_payload: {
          strength: candidate.strength,
          rumour: candidate.rumour,
          monitor: 'b3e',
          ingested_via: candidate.ingestedVia ?? 'feed',
        },
      }));
      const stored = await rest(
        db,
        'comic_adaptation_announcements?on_conflict=source_id,item_key&select=id,item_key',
        {
          method: 'POST',
          headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
          body: JSON.stringify(rows),
        },
      );
      inserted += stored.length;
      duplicates += batch.length - stored.length;
      for (const row of stored) {
        const candidate = batch.find((entry) => entry.itemKey === row.item_key);
        events.push({
          announcement_id: row.id,
          event_type: 'ingested',
          actor: 'monitor',
          detail: {
            source: slug,
            strength: candidate?.strength ?? 'none',
            keywords: candidate?.detectedKeywords ?? [],
          },
        });
      }
    }
  }
  for (let offset = 0; offset < events.length; offset += MAX_BATCH) {
    await rest(db, 'comic_announcement_events', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(events.slice(offset, offset + MAX_BATCH)),
    });
  }
  return { inserted, duplicates, events: events.length };
}


function markdownReport(report) {
  const lines = [
    '# Comics announcement monitor',
    '',
    `- generated: ${report.generatedAt}`,
    `- mode: ${report.mode}`,
    `- sources: ${report.sources.length}`,
    `- candidates: ${report.candidates.length}`,
    `- new since last run: ${report.candidates.filter((item) => item.isNew).length}`,
    `- actionable strong signals: ${report.candidates.filter((item) => item.actionable).length}`,
    `- rejected by policy: ${report.rejected.length}`,
    '',
    'Ingestion is not confirmation. Every row stays pending_review until a human',
    'checks the official statement and records a confirmation URL.',
    '',
    '## Sources',
    '',
    '| source | status | items | new | rejected |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const source of report.sources) {
    const error = source.error ? `: ${source.error}` : '';
    lines.push(`| ${source.slug} | ${source.status}${error} | ${source.items} | ${source.newItems} | ${source.rejected} |`);
  }
  if (report.candidates.length > 0) {
    lines.push('', '## Candidates', '');
    for (const item of report.candidates) {
      const flag = item.actionable ? '**strong**' : item.strength;
      const rumour = item.rumour ? ', rumour wording' : '';
      const fresh = item.isNew ? ', new' : '';
      lines.push(`- [${item.title}](${item.url}) — ${item.sourceSlug}, ${flag}${rumour}${fresh}`);
    }
  }
  if (report.rejected.length > 0) {
    lines.push('', '## Rejected by URL policy', '');
    for (const item of report.rejected.slice(0, 30)) {
      lines.push(`- ${item.reason}: ${item.title ?? item.url ?? '(no title)'}`);
    }
  }
  return `${lines.join('\n')}\n`;
}


async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    log('usage: node scripts/comics-b3e-monitor.mjs [--dry-run|--apply] [--source slug] [--candidates file] [--out dir] [--timeout ms] [--limit n]');
    return 0;
  }
  const config = await loadConfig();
  if (args.limit === null && process.env.COMICS_MONITOR_LIMIT) {
    args.limit = Number(process.env.COMICS_MONITOR_LIMIT) || null;
  }

  let db = null;
  if (args.mode === 'apply') {
    if (process.env.COMICS_MONITOR_APPLY !== '1') {
      throw new Error('B3E_MONITOR_APPLY_DISABLED: set COMICS_MONITOR_APPLY=1 to write; dry run is the default');
    }
    db = dbConfig(process.env);
    if (!db) {
      throw new Error('B3E_MONITOR_APPLY_DISABLED: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
  }

  const selected = args.source
    ? config.sources.filter((source) => source.slug === args.source)
    : config.sources;
  if (args.source && selected.length === 0) throw new Error(`unknown source: ${args.source}`);

  await mkdir(args.out, { recursive: true });
  const statePath = path.join(args.out, 'state.json');
  const state = await readJson(statePath, {});

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.mode,
    configVersion: config.version ?? null,
    sources: [],
    candidates: [],
    rejected: [],
  };

  for (const source of selected) {
    if (source.isEnabled === false) {
      report.sources.push({ slug: source.slug, status: 'disabled', items: 0, newItems: 0, rejected: 0 });
      continue;
    }
    if (source.kind !== 'rss' && source.kind !== 'atom') {
      report.sources.push({
        slug: source.slug,
        status: 'manual_review_required',
        items: 0,
        newItems: 0,
        rejected: 0,
        error: 'manual source has no feed; use --candidates and review by hand',
      });
      continue;
    }
    const result = await fetchFeed(source, state[source.slug], args);
    if (!result.ok) {
      report.sources.push({
        slug: source.slug,
        status: 'failed',
        items: 0,
        newItems: 0,
        rejected: 0,
        error: result.error,
      });
      continue;
    }
    const seen = new Set(state[source.slug]?.seen ?? []);
    let rejected = 0;
    let newItems = 0;
    const itemKeys = [];
    for (const item of result.items) {
      const built = buildCandidate(item, source);
      if (!built.ok) {
        rejected += 1;
        report.rejected.push({
          sourceSlug: source.slug,
          reason: built.reason,
          title: item.title,
          url: item.link,
        });
        continue;
      }
      itemKeys.push(built.candidate.itemKey);
      const candidate = { ...built.candidate, isNew: !seen.has(built.candidate.itemKey) };
      if (candidate.isNew) newItems += 1;
      report.candidates.push(candidate);
    }
    state[source.slug] = {
      etag: result.etag ?? null,
      lastModified: result.lastModified ?? null,
      lastFetchedAt: new Date().toISOString(),
      feedTitle: result.feedTitle ?? null,
      seen: [...new Set([...itemKeys, ...seen])].slice(0, 500),
    };
    report.sources.push({
      slug: source.slug,
      status: result.unchanged ? 'unchanged_304' : 'ok',
      items: result.items.length,
      newItems,
      rejected,
      feedTitle: result.feedTitle ?? null,
      fetchedAt: new Date().toISOString(),
    });
  }


  if (args.candidates) {
    const raw = JSON.parse(await readFile(path.resolve(args.candidates), 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.items;
    if (!Array.isArray(list)) throw new Error('candidates file must be an array or {items: [...]}');
    for (const entry of list) {
      const source = config.sources.find((item) => item.slug === entry.sourceSlug);
      if (!source) {
        report.rejected.push({ reason: 'unknown_source', title: entry.title, url: entry.url });
        continue;
      }
      const built = buildCandidate(
        {
          title: entry.title,
          summary: entry.summary ?? '',
          link: entry.url,
          guid: entry.guid ?? entry.url,
          publishedAt: entry.publishedAt ?? null,
        },
        source,
      );
      if (!built.ok) {
        report.rejected.push({
          sourceSlug: source.slug,
          reason: built.reason,
          title: entry.title,
          url: entry.url,
        });
        continue;
      }
      report.candidates.push({
        ...built.candidate,
        isNew: true,
        ingestedVia: 'candidates',
        sourceSlug: source.slug,
      });
    }
  }

  if (args.limit && report.candidates.length > args.limit) {
    report.candidates = report.candidates.slice(0, args.limit);
  }

  const attempted = report.sources.filter(
    (source) => source.status !== 'disabled' && source.status !== 'manual_review_required',
  ).length;
  const ok = report.sources.filter(
    (source) => source.status === 'ok' || source.status === 'unchanged_304',
  ).length;

  let applied = null;
  if (db && report.candidates.length > 0) {
    const sourcesBySlug = new Map(config.sources.map((source) => [source.slug, source]));
    applied = await applyCandidates(db, report.candidates, sourcesBySlug);
  } else if (db) {
    await syncSources(db, selected);
    applied = { inserted: 0, duplicates: 0, events: 0 };
  }

  report.db = db ? { applied: true, ...applied } : { applied: false, reason: 'dry-run' };
  report.summary = {
    attemptedSources: attempted,
    successfulSources: ok,
    candidates: report.candidates.length,
    newCandidates: report.candidates.filter((item) => item.isNew).length,
    actionable: report.candidates.filter((item) => item.actionable).length,
    rejected: report.rejected.length,
  };

  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(args.out, `${stamp}.json`);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(jsonPath, json, 'utf8');
  await writeFile(path.join(args.out, 'latest.json'), json, 'utf8');
  await writeFile(path.join(args.out, 'summary.md'), markdownReport(report), 'utf8');
  if (args.mode === 'dry-run') {
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  log(`B3E monitor ${args.mode}: sources ${ok}/${attempted}, candidates ${report.candidates.length}, new ${report.summary.newCandidates}, actionable ${report.summary.actionable}, rejected ${report.rejected.length}`);
  log(`report: ${jsonPath}`);
  if (attempted > 0 && ok === 0) {
    log('B3E_MONITOR_ALL_SOURCES_FAILED');
    return 3;
  }
  log(args.mode === 'dry-run' ? 'B3E_MONITOR_DRY_RUN_OK' : 'B3E_MONITOR_APPLY_OK');
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    log(`B3E_MONITOR_ERROR: ${error?.message ?? error}`);
    process.exitCode = 1;
  });
