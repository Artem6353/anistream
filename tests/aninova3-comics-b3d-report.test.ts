import { describe, expect, it } from 'vitest';
import {
  B3D_CATALOG_SCHEMA_VERSION,
  B3D_REPORT_SCHEMA_VERSION,
  buildQualityReport,
  canonicalJson,
  reportFileContent,
  sha256Hex,
  type QualityReport,
} from '../lib/aninova3/comics/operations/report';
import { observation, review, snapshot, work } from './fixtures/b3d-operations';

const COMMIT = 'e1f752490a761aa1c86d4cf608b687591ae3042b';

function build(over: Parameters<typeof buildQualityReport>[0]['snapshot'] = snapshot(), previous: QualityReport | null = null) {
  return buildQualityReport({
    snapshot: over,
    previous,
    generatedAt: over.generated_at,
    commitSha: COMMIT,
    inputChecksums: { 'plan.json': 'abc', 'b3c-report.json': 'def' },
  });
}

describe('B3-D quality report', () => {
  it('is deterministic for the same input and separates the timestamp', () => {
    const first = build();
    const second = build();
    expect(first.report_checksum).toBe(second.report_checksum);
    expect(reportFileContent(first)).toBe(reportFileContent(second));
    expect(first.schema_version).toBe(B3D_REPORT_SCHEMA_VERSION);
    expect(first.catalog_schema_version).toBe(B3D_CATALOG_SCHEMA_VERSION);
    expect(first.commit_sha).toBe(COMMIT);
    expect(first.generated_at).toBe(snapshot().generated_at);
    expect(first.report_checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(sha256Hex('a')).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
  });

  it('explicitly marks comparison unavailable when no previous report is supplied', () => {
    const report = build();
    expect(report.comparison.available).toBe(false);
    expect(report.comparison.reason).toBe('previous_report_not_provided');
    expect(report.comparison.review_queue_delta).toBeNull();
    expect(report.comparison.new_conflict_keys).toBeNull();
    expect(report.comparison.resolved_conflict_keys).toBeNull();
    expect(report.comparison.eligibility_changes).toBeNull();
  });

  it('computes deltas only against a supplied previous snapshot', () => {
    const previous = build();
    const currentSnapshot = snapshot({
      review_items: [...snapshot().review_items, review('r10', { reason: 'source_conflict', details: { field: 'chapters' } })],
      observations: [...snapshot().observations, observation('o3', { is_conflict: true, conflict_group: 'new' })],
    });
    const current = build(currentSnapshot, previous);
    expect(current.comparison.available).toBe(true);
    expect(current.comparison.reason).toBeNull();
    expect(current.comparison.review_queue_delta?.total).toBe(1);
    expect(current.comparison.review_queue_delta?.by_reason.source_conflict).toBe(1);
    expect(current.comparison.new_conflict_keys).toEqual(['w1:chapters:new']);
    expect(current.comparison.resolved_conflict_keys).toEqual([]);
    expect(current.comparison.previous_generated_at).toBe(previous.generated_at);
  });

  it('keeps publication gates conservative and separate from metadata counters', () => {
    const safe = build(snapshot({
      works: [work('w1', { publication_status: 'draft' }), work('w2', { publication_status: 'draft' })],
      approved_rights: [],
      counts: { ...snapshot().counts, public_works: 0, public_chapters: 0 },
    }));
    expect(safe.publication.gates.all_works_draft).toBe(true);
    expect(safe.publication.gates.public_works_zero).toBe(true);
    expect(safe.publication.gates.public_chapters_zero).toBe(true);
    expect(safe.publication.gates.approved_rights_zero).toBe(true);
    expect(safe.publication.gates.approved_works_zero).toBe(true);
    expect(safe.publication.gates.relation_primary_zero).toBe(true);
    expect(safe.publication.gates.relation_public_zero).toBe(true);
    expect(safe.relations.can_auto_confirm).toBe(false);
    expect(safe.relations.summary.primary).toBe(0);

    const unsafe = build();
    expect(unsafe.publication.gates.all_works_draft).toBe(false);
    expect(unsafe.publication.gates.approved_works_zero).toBe(false);
  });

  it('does not mutate the source snapshot or previous report', () => {
    const data = snapshot();
    const before = JSON.stringify(data);
    const previous = build();
    const previousBefore = JSON.stringify(previous);
    build(data, previous);
    expect(JSON.stringify(data)).toBe(before);
    expect(JSON.stringify(previous)).toBe(previousBefore);
  });
});