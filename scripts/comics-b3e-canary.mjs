#!/usr/bin/env node
/**
 * B3-E disposable PGlite canary. Applies the committed B3 migrations plus the
 * read-integration and announcement-monitor migrations, runs their SQL contracts,
 * checks public/anon/service_role access, and verifies rollback + reapply.
 *
 * Scope: local PostgreSQL semantics only. This proves SQL/DDL behaviour, NOT
 * Supabase PostgREST/RLS/goTrue behavior — see docs/comics/B3E_REPORT.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();

async function applyFile(file) {
  await db.exec(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

async function scalar(sql) {
  return (await db.query(sql)).rows[0];
}

async function expectReject(sql, pattern) {
  try {
    await db.query(sql);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (!pattern.test(message)) throw new Error(`unexpected rejection (${message}) for: ${sql}`);
    return;
  }
  throw new Error(`expected rejection for: ${sql}`);
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

async function applyAll() {
  for (const file of [
    'supabase/migrations/20261123_comics_foundation.sql',
    'supabase/migrations/20261123_comics_rls.sql',
    'supabase/migrations/20261124_comics_b3b_chapter_urls_evidence.sql',
    'supabase/migrations/20261125_comics_b3c_quality_relations.sql',
    'supabase/migrations/20261126_comics_b3c1_integrity_hardening.sql',
    'supabase/migrations/20261128_comics_b3e_read_integration.sql',
    'supabase/migrations/20261129_comics_b3e_announcement_monitor.sql',
  ]) await applyFile(file);
}

async function assertMonitorAbsent(stage) {
  const row = await scalar(`select
    to_regclass('public.comic_announcement_sources') is null as sources,
    to_regclass('public.comic_adaptation_announcements') is null as announcements,
    to_regclass('public.comic_announcement_events') is null as events,
    (select count(*)::int from pg_proc where proname = 'comic_announcement_events_append_only') = 0 as fn,
    (select count(*)::int from pg_trigger where tgname = 'comic_announcement_events_no_update_delete') = 0 as trigger`);
  if (Object.values(row).some((value) => value !== true)) {
    throw new Error(`${stage}: monitor objects were not fully rolled back: ${JSON.stringify(row)}`);
  }
}

async function assertReadViewsAbsent(stage) {
  const row = await scalar(`select
    to_regclass('public.comic_public_catalog') is null as catalog,
    to_regclass('public.comic_public_adaptations') is null as adaptations,
    to_regclass('public.comic_public_kind_counts') is null as kinds,
    to_regclass('public.comic_public_genre_counts') is null as genres`);
  if (Object.values(row).some((value) => value !== true)) {
    throw new Error(`${stage}: read views were not fully rolled back: ${JSON.stringify(row)}`);
  }
}

async function main() {
  await bootstrap();
  await applyAll();
  console.log('B3E_MIGRATIONS_OK');

  await applyFile('supabase/tests/b3e_read_integration.sql');
  await applyFile('supabase/tests/b3e_announcement_monitor.sql');
  console.log('B3E_SQL_CONTRACTS_OK');

  const seeds = await scalar(`select count(*)::int as n from public.comic_announcement_sources where is_official and is_enabled`);
  if (seeds.n !== 5) throw new Error(`expected 5 enabled official sources, got ${seeds.n}`);

  await db.exec('set role anon');
  try {
    await expectReject('select count(*) from public.comic_adaptation_announcements', /permission denied/i);
    await expectReject('select count(*) from public.comic_announcement_sources', /permission denied/i);
  } finally {
    await db.exec('reset role');
  }

  await db.exec('set role service_role');
  try {
    const visible = await scalar(`select count(*)::int as n from public.comic_announcement_sources`);
    if (visible.n < 5) throw new Error('service_role cannot read the allowlist');
    await db.exec(`insert into public.comic_adaptation_announcements
      (source_id, item_key, title, url, content_hash)
      select id, 'canary-service-role', 'TV anime adaptation announced',
        'https://www.bones.co.jp/2026/07/06/382/', repeat('d', 64)
      from public.comic_announcement_sources where slug = 'bones'`);
    const pending = await scalar(`select count(*)::int as n from public.comic_adaptation_announcements where item_key = 'canary-service-role' and status = 'pending_review' and confirmation_url is null`);
    if (pending.n !== 1) throw new Error('service_role insert did not stay pending_review');
  } finally {
    await db.exec('reset role');
  }
  console.log('B3E_ROLE_ACCESS_OK');

  await applyFile('supabase/rollback/20261129_comics_b3e_announcement_monitor_rollback.sql');
  await assertMonitorAbsent('monitor rollback');
  await applyFile('supabase/migrations/20261129_comics_b3e_announcement_monitor.sql');
  await applyFile('supabase/tests/b3e_announcement_monitor.sql');
  console.log('B3E_MONITOR_ROLLBACK_REAPPLY_OK');

  await applyFile('supabase/rollback/20261128_comics_b3e_read_integration_rollback.sql');
  await assertReadViewsAbsent('read rollback');
  await applyFile('supabase/migrations/20261128_comics_b3e_read_integration.sql');
  await applyFile('supabase/tests/b3e_read_integration.sql');
  console.log('B3E_READ_ROLLBACK_REAPPLY_OK');

  console.log('B3E_CANARY_OK');
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error('B3E_CANARY_ERROR:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
