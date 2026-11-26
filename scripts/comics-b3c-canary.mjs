#!/usr/bin/env node
/**
 * B3-C disposable PGlite canary. Applies the committed migrations, runs the
 * B3-A/B/B3-C SQL contracts, exercises rollback + reapply, inserts a 20-work
 * canary plan and verifies quality/relation/adult/author gates. No network,
 * no Supabase, no production database and no public publication.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-11-25T00:00:00.000Z';
const db = new PGlite();
const quote = (name) => `"${name.replaceAll('"', '""')}"`;

function sqlValue(key, value) {
  if (key === 'details' || key === 'value_json') return JSON.stringify(value);
  return value;
}

async function applyFile(file) {
  await db.exec(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

async function bootstrap() {
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.titles (id int primary key, slug text not null unique, anilist_id int not null unique);
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
}

async function applyMigrationsThroughB3C() {
  for (const file of [
    'supabase/migrations/20261123_comics_foundation.sql',
    'supabase/migrations/20261123_comics_rls.sql',
    'supabase/migrations/20261124_comics_b3b_chapter_urls_evidence.sql',
    'supabase/migrations/20261125_comics_b3c_quality_relations.sql',
  ]) await applyFile(file);
}

async function runContracts() {
  await applyFile('supabase/tests/b3a_comics_rls.sql');
  await applyFile('supabase/tests/b3b_comics_gates.sql');
  await applyFile('supabase/tests/b3c_comics_quality.sql');
}

async function seedTitles() {
  const records = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/data/titles.json'), 'utf8'));
  for (let offset = 0; offset < records.length; offset += 500) {
    const batch = records.slice(offset, offset + 500);
    const values = [];
    const params = [];
    for (const [index, record] of batch.entries()) {
      const base = index * 3;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
      params.push(record.anilistId, `anime-${record.anilistId}`, record.anilistId);
    }
    await db.query(`insert into public.titles (id, slug, anilist_id) values ${values.join(', ')} on conflict do nothing`, params);
  }
}

async function applyPlan(plan) {
  let inserted = 0;
  for (const operation of plan.operations) {
    if (operation.op !== 'INSERT' || !operation.row) continue;
    const row = operation.row;
    const columns = Object.keys(row).filter((key) => row[key] !== undefined);
    const values = columns.map((key) => sqlValue(key, row[key]));
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const sql = `insert into public.${operation.table} (${columns.map(quote).join(', ')}) values (${placeholders}) on conflict do nothing`;
    const result = await db.query(sql, values);
    inserted += result.affectedRows ?? 0;
  }
  return inserted;
}

async function scalar(sql) {
  return (await db.query(sql)).rows[0];
}

async function snapshot() {
  const tables = ['comic_works','comic_source_observations','comic_external_ids','comic_aliases','comic_people','comic_credits','comic_adaptations','comic_review_queue'];
  const out = {};
  for (const table of tables) out[table] = (await scalar(`select count(*)::int as n from public.${table}`)).n;
  const gates = await scalar(`select
    (select count(*)::int from public.comic_works where publication_status <> 'draft' or published_at is not null) as non_draft,
    (select count(*)::int from public.comic_public_works) as public_works,
    (select count(*)::int from public.comic_public_chapters) as public_chapters,
    (select count(*)::int from public.comic_rights) as rights,
    (select count(*)::int from public.comic_chapters) as chapters,
    (select count(*)::int from public.comic_reading_sources) as sources`);
  return { tables: out, ...gates };
}

async function main() {
  await bootstrap();
  await applyMigrationsThroughB3C();
  await runContracts();
  console.log('SQL_CONTRACTS_OK');

  await applyFile('supabase/rollback/20261125_comics_b3c_rollback.sql');
  const rolledBack = await scalar(`select
    (select count(*)::int from information_schema.tables where table_schema='public' and table_name='comic_source_observations') as observations,
    (select count(*)::int from information_schema.columns where table_schema='public' and table_name='comic_works' and column_name='content_rating_status') as rating,
    (select count(*)::int from information_schema.columns where table_schema='public' and table_name='comic_people' and column_name='identity_status') as identity,
    (select count(*)::int from information_schema.columns where table_schema='public' and table_name='comic_adaptations' and column_name='normalized_relation_type') as normalized`);
  if (Number(rolledBack.observations) !== 0 || Number(rolledBack.rating) !== 0 || Number(rolledBack.identity) !== 0 || Number(rolledBack.normalized) !== 0) {
    throw new Error(`rollback left B3-C objects: ${JSON.stringify(rolledBack)}`);
  }
  await applyFile('supabase/migrations/20261125_comics_b3c_quality_relations.sql');
  await applyFile('supabase/tests/b3c_comics_quality.sql');
  console.log('ROLLBACK_REAPPLY_OK');

  await seedTitles();
  const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  let report;
  try {
    const mod = await server.ssrLoadModule('/lib/aninova3/comics/import/dry-run.ts');
    report = mod.runDryRun({ repoRoot: ROOT, now: NOW, canarySize: 20 });
  } finally {
    await server.close();
  }
  const canary = report.canary;
  const firstInserted = await applyPlan(canary);
  const first = await snapshot();
  const secondInserted = await applyPlan(canary);
  const second = await snapshot();

  const quality = await scalar(`select
    (select count(*)::int from public.comic_source_observations where is_conflict) as conflicts,
    (select count(*)::int from public.comic_source_observations where source_name='anilist') as anilist_obs,
    (select count(*)::int from public.comic_source_observations where source_name='shikimori') as shikimori_obs,
    (select count(*)::int from public.comic_works where content_rating_status <> 'unknown' or is_adult) as non_unknown_adult,
    (select count(*)::int from public.comic_works where source_kind_raw is null) as missing_raw_kind,
    (select count(*)::int from public.comic_people where identity_status <> 'unidentified_name_bucket' or source_person_id is not null or is_public) as bad_people,
    (select count(*)::int from public.comic_adaptations where normalized_relation_type='unknown') as unknown_normalized,
    (select count(*)::int from public.comic_adaptations where is_primary or is_public or confidence_level='confirmed' or verification_status<>'recorded') as promoted_adaptations,
    (select count(*)::int from public.comic_external_ids where source_name in ('mal','shikimori') and external_id='124776') as duplicate_mal,
    (select count(*)::int from public.comic_aliases where is_public and alias_type in ('original_title','native_title')) as public_original_aliases`);
  const b1d = (await db.query(`select details->>'b1d_category' as category, count(*)::int as n from public.comic_review_queue where details ? 'b1d_category' group by 1 order by 1`)).rows;
  const newReasons = (await db.query(`select reason, count(*)::int as n from public.comic_review_queue where reason in ('source_metadata_conflict','kind_unknown','duplicate_public_title','relation_evidence_conflict','ambiguous_people_identity','missing_provenance') group by 1 order by 1`)).rows;

  // Synthetic gate fixture: the real imported corpus has no adult classification.
  await db.exec(`
    insert into public.comic_works (id, internal_key, slug, title_ru, title_ru_status,
      kind, is_adult, content_rating_status, content_rating_source, content_rating_checked_at,
      publication_status, published_at, origin_source_name)
    values
      ('e1000000-0000-4000-8000-000000000001', 'comic:test:b3c-gate-unknown', 'b3c-gate-unknown',
       'Неизвестный возраст', 'source_verified', 'manga', false, 'unknown', null, null,
       'approved', now() - interval '1 day', 'aninova'),
      ('e1000000-0000-4000-8000-000000000002', 'comic:test:b3c-gate-verified', 'b3c-gate-verified',
       'Проверено не взрослое', 'source_verified', 'manga', false, 'verified_non_adult', 'manual', now(),
       'approved', now() - interval '1 day', 'aninova'),
      ('e1000000-0000-4000-8000-000000000003', 'comic:test:b3c-gate-adult', 'b3c-gate-adult',
       'Взрослое', 'source_verified', 'manga', true, 'adult', 'manual', now(),
       'approved', now() - interval '1 day', 'aninova');
    insert into public.comic_rights (work_id, permission, status, evidence_ref, reviewed_by, reviewed_at)
    values
      ('e1000000-0000-4000-8000-000000000001', 'metadata', 'approved', 'https://example.test/rights/unknown', 'reviewer', now()),
      ('e1000000-0000-4000-8000-000000000002', 'metadata', 'approved', 'https://example.test/rights/verified', 'reviewer', now()),
      ('e1000000-0000-4000-8000-000000000003', 'metadata', 'approved', 'https://example.test/rights/adult', 'reviewer', now());
  `);
  const adultGate = {
    publicIds: (await db.query(`select id::text from public.comic_public_works order by id`)).rows.map((row) => row.id),
    hiddenUnknown: (await scalar(`select count(*)::int as n from public.comic_public_works where id = 'e1000000-0000-4000-8000-000000000001'`)).n,
    hiddenAdult: (await scalar(`select count(*)::int as n from public.comic_public_works where id = 'e1000000-0000-4000-8000-000000000003'`)).n,
  };

  console.log(JSON.stringify({
    planHash: report.planHash,
    canaryHash: report.canaryHash,
    canaryWorkIds: canary.workIds,
    counts: report.counts,
    coverage: report.canaryCoverage,
    firstInserted,
    secondInserted,
    first,
    second,
    idempotent: JSON.stringify(first) === JSON.stringify(second) && secondInserted === 0,
    quality,
    b1d,
    newReasons,
    adultGate,
  }, null, 2));

  if (canary.works.length < 10 || canary.works.length > 50) throw new Error('canary size out of range');
  if (first.tables.comic_works !== canary.works.length) throw new Error('canary work count mismatch');
  if (first.tables.comic_source_observations !== canary.sourceObservations.length) throw new Error('source observation count mismatch');
  if (Number(quality.conflicts) < 1) throw new Error('canary has no conflict observation');
  if (Number(quality.anilist_obs) < 1 || Number(quality.shikimori_obs) < 1) throw new Error('canary lacks both source observations');
  if (Number(quality.non_unknown_adult) !== 0 || first.non_draft !== 0) throw new Error('canary has adult/published works');
  if (Number(quality.missing_raw_kind) !== 0) throw new Error('canary lost raw source kind');
  if (Number(quality.bad_people) !== 0) throw new Error('name-only author was identified or made public');
  if (Number(quality.promoted_adaptations) !== 0) throw new Error('canary promoted an adaptation');
  if (Number(quality.duplicate_mal) !== 0) throw new Error('ambiguous MAL/Shikimori id was attached');
  if (Number(quality.public_original_aliases) !== 0) throw new Error('original/native alias is public');
  if (first.public_works !== 0 || first.public_chapters !== 0) throw new Error('canary became public');
  if (first.rights !== 0 || first.chapters !== 0 || first.sources !== 0) throw new Error('canary created rights/chapters/sources');
  if (!report.canaryCoverage.work_ids.includes(131323)) throw new Error('canary misses the known duplicate');
  const categories = new Set(b1d.map((row) => row.category));
  for (const category of ['duplicateMal','multiSourceNeedsReview','comicAdaptsAnime','adaptationAfterAnime']) {
    if (!categories.has(category)) throw new Error(`canary misses B1D category ${category}`);
  }
  if (adultGate.publicIds.length !== 1 || adultGate.publicIds[0] !== 'e1000000-0000-4000-8000-000000000002') {
    throw new Error(`adult gate leaked or hid the verified non-adult work: ${JSON.stringify(adultGate)}`);
  }
  if (Number(adultGate.hiddenUnknown) !== 0 || Number(adultGate.hiddenAdult) !== 0) {
    throw new Error('adult gate did not hide unknown/adult works');
  }
  console.log('B3C_CANARY_OK');
}

try {
  await main();
} catch (error) {
  console.error('B3C_CANARY_FAILED', error.message);
  if (error.detail) console.error('DETAIL', error.detail);
  if (error.hint) console.error('HINT', error.hint);
  process.exitCode = 1;
} finally {
  await db.close();
}
