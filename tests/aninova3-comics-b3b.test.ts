import { describe, expect, it } from 'vitest';
import { runDryRun } from '@/lib/aninova3/comics/import/dry-run';
import { assertLocalDatabaseUrl, stableUuid } from '@/lib/aninova3/comics/import/safety';

const report = runDryRun({ repoRoot: process.cwd(), canarySize: 20 });
const workById = new Map(report.plan.works.map((op) => [op.row.internal_key, op.row]));

describe('B3-B source adapters and dry-run', () => {
  it('reads the measured local artifacts, not meta.total', () => {
    expect(report.counts.sourceGraphComics).toBe(4100);
    expect(report.counts.sourceGraphEdges).toBe(5748);
    expect(report.counts.verifiedMetadataRecords).toBe(2265);
    expect(report.counts.metadataCandidates).toBe(2170);
    expect(report.counts.verifiedMetaDeclaredTotal).toBe(2444);
    expect(report.warnings.some((w) => w.includes('meta.total'))).toBe(true);
  });

  it('keeps every imported work internal and creates no rights or chapters', () => {
    expect(report.plan.works).toHaveLength(4100);
    expect(report.plan.works.every((w) => w.row.publication_status === 'draft')).toBe(true);
    expect(report.plan.works.every((w) => w.row.published_at === null)).toBe(true);
    expect(report.plan.readingSources).toHaveLength(0);
    expect(report.plan.chapters).toHaveLength(0);
    expect(report.plan.rights).toHaveLength(0);
    expect(report.counts.approvedRights).toBe(0);
    expect(report.counts.publicChapters).toBe(0);
  });

  it('maps only public verified Russian titles and keeps candidates internal', () => {
    const monster = workById.get('comic:anilist:30001');
    expect(monster?.title_ru).toBe('Монстр');
    expect(monster?.title_ru_status).toBe('source_verified');
    const ambiguous = workById.get('comic:anilist:131323');
    expect(ambiguous?.title_ru).toBeNull();
    expect(ambiguous?.title_ru_status).toBe('candidate');
    const mismatch = workById.get('comic:anilist:30025');
    expect(mismatch?.title_ru).toBeNull();
    expect(mismatch?.title_ru_status).toBe('name_mismatch');
    const monsterAliases = report.plan.aliases.filter((a) => a.row.work_id === monster?.id);
    expect(monsterAliases.some((a) => a.row.alias_type === 'official_russian')).toBe(true);
    expect(monsterAliases.every((a) => a.row.is_public === false || a.row.alias_type === 'official_russian')).toBe(true);
  });

  it('does not assign the ambiguous MAL/Shikimori id to any of the four works', () => {
    const skipped = report.plan.operations.filter((item) => item.op === 'SKIP');
    expect(new Set(skipped.map((item) => item.key)).size).toBe(skipped.length);
    const group = report.duplicates.externalIdGroups.find(
      (g) => g.source_name === 'mal' && g.external_id === '124776',
    );
    expect(group?.work_ids).toHaveLength(4);
    for (const id of group?.work_ids ?? []) {
      const key = `comic:anilist:${id}`;
      const ext = report.plan.operations.filter(
        (o) => o.table === 'comic_external_ids' && o.row?.work_id === workById.get(key)?.id,
      );
      expect(ext.some((o) => o.row?.source_name === 'mal' && o.row.external_id === '124776')).toBe(false);
      expect(ext.some((o) => o.row?.source_name === 'shikimori' && o.row.external_id === '124776')).toBe(false);
      expect(report.plan.reviewQueue.some((q) => q.row.work_id === workById.get(key)?.id)).toBe(true);
    }
  });

  it('never promotes AniList ADAPTATION to confirmed or primary', () => {
    expect(report.plan.adaptations).toHaveLength(5748);
    for (const a of report.plan.adaptations) {
      expect(a.row.direction).toBe('unknown');
      expect(a.row.confidence_level).toBe('unknown');
      expect(a.row.is_primary).toBe(false);
      expect(a.row.is_public).toBe(false);
      expect(a.row.verification_status).toBe('recorded');
    }
    const adaptation = report.plan.adaptations.find((a) => a.row.raw_relation_type === 'ADAPTATION');
    expect(adaptation).toBeTruthy();
    expect(report.plan.relations).toHaveLength(0);
  });

  it('records provenance and deterministic ids', () => {
    expect(report.plan.works.every((w) => w.row.origin_source_name === 'anilist')).toBe(true);
    expect(report.plan.works.every((w) => w.row.origin_source_url?.startsWith('https://anilist.co/manga/'))).toBe(true);
    expect(report.plan.externalIds.every((e) => /^[a-f0-9]{64}$/.test(e.row.source_payload_hash ?? ''))).toBe(true);
    expect(stableUuid('comic:anilist:30001')).toBe(stableUuid('comic:anilist:30001'));
    expect(stableUuid('comic:anilist:30001')).not.toBe(stableUuid('comic:anilist:30002'));
  });

  it('is deterministic across repeated dry-runs', () => {
    const again = runDryRun({ repoRoot: process.cwd(), canarySize: 20 });
    expect(again.planHash).toBe(report.planHash);
    expect(again.counts).toEqual(report.counts);
    expect(again.plan.operations.length).toBe(report.plan.operations.length);
  }, 30_000);

  it('builds a bounded canary containing conflicts and ordinary works', () => {
    expect(report.canary.workIds).toHaveLength(20);
    expect(report.canary.workIds).toContain(131323);
    expect(report.canary.works.length).toBeGreaterThan(10);
    expect(report.canary.works.length).toBeLessThanOrEqual(20);
    expect(report.canary.adaptations.length).toBeGreaterThan(0);
    expect(report.canary.workIds.every((id) => report.canary.works.some((w) => w.row.internal_key === `comic:anilist:${id}`))).toBe(true);
  });

  it('rejects non-local database targets', () => {
    expect(() => assertLocalDatabaseUrl('postgres://localhost:5432/aninova')).not.toThrow();
    expect(() => assertLocalDatabaseUrl('postgres://127.0.0.1:5432/aninova')).not.toThrow();
    expect(() => assertLocalDatabaseUrl('postgres://db.supabase.co:5432/postgres')).toThrow();
    expect(() => assertLocalDatabaseUrl('postgres://user:pass@example.com/aninova')).toThrow();
    expect(() => assertLocalDatabaseUrl('postgres://localhost:5432/aninova?sslmode=require&host=example.com')).toThrow();
  });

  it('keeps all external terms reviews unknown and attribution unasserted', () => {
    expect(report.sourceReview.every((s) => s.terms_review_status === 'unknown')).toBe(true);
    expect(report.sourceReview.every((s) => s.attribution_requirements.length === 0)).toBe(true);
  });
});
