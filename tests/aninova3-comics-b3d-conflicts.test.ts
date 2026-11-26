import { describe, expect, it } from 'vitest';
import { buildSourceConflicts, buildWorkConflictView, listConflictWorkIds } from '../lib/aninova3/comics/operations/conflicts';
import { observation, review, work } from './fixtures/b3d-operations';

describe('B3-D source conflict inspector', () => {
  const observations = [
    observation('o1', { field_name: 'chapters', value_json: 10, is_conflict: true, conflict_group: 'w1:chapters', source_name: 'anilist' }),
    observation('o2', { field_name: 'chapters', value_json: 12, is_conflict: true, conflict_group: 'w1:chapters', source_name: 'shikimori' }),
    observation('o3', { field_name: 'chapters', value_json: 10, is_conflict: false, conflict_group: null, source_name: 'b1c' }),
    observation('o4', { field_name: 'publication_year', value_json: 2020, is_conflict: false, conflict_group: null }),
    observation('o5', { field_name: 'chapters', value_json: 11, is_conflict: true, conflict_group: 'w1:chapters:2', source_name: 'mal' }),
  ];
  const reviewItems = [
    review('r1', {
      reason: 'source_conflict',
      details: { field: 'chapters', canonical_action: 'no_winner_no_overwrite', values: [10, 12] },
    }),
    review('r2', { reason: 'source_metadata_conflict', details: { field: 'chapters', canonical_action: 'review_only' } }),
  ];

  it('keeps every source value and never selects a canonical winner', () => {
    const groups = buildSourceConflicts(observations, reviewItems);
    expect(groups).toHaveLength(2);
    const first = groups.find((group) => group.conflictGroup === 'w1:chapters');
    expect(first?.values).toHaveLength(3);
    expect(first?.values.map((entry) => entry.value)).toEqual([10, 10, 12]);
    expect(first?.distinctValues).toBe(2);
    expect(first?.canonicalValue).toBeNull();
    expect(first?.resolution).toBe('unresolved');
    expect(first?.winnerSelected).toBe(false);
    expect(first?.nonCanonicalReason).toContain('no_winner_no_overwrite');
    expect(first?.reviewItemIds).toEqual(['r1', 'r2']);
    expect(first?.warnings.join(' ')).not.toContain('source URL');
  });

  it('includes source URL, external id, join key, fetched time and review status per value', () => {
    const groups = buildSourceConflicts(observations, reviewItems);
    const values = groups[0]?.values ?? [];
    for (const value of values) {
      expect(value.sourceName.length).toBeGreaterThan(0);
      expect(value.observedAt).toBe('2026-05-01T00:00:00.000Z');
      expect(value.verificationStatus).toBe('source_verified');
      expect(value.payloadHash.length).toBeGreaterThan(0);
      expect(value).toHaveProperty('sourceUrl');
      expect(value).toHaveProperty('externalId');
      expect(value).toHaveProperty('joinKey');
    }
  });

  it('flags missing provenance and missing review links without hiding values', () => {
    const groups = buildSourceConflicts([
      observation('x1', { source_url: null, is_conflict: true, conflict_group: 'w1:chapters' }),
      observation('x2', { source_url: null, is_conflict: true, conflict_group: 'w1:chapters', source_name: 'shikimori' }),
    ], []);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.values).toHaveLength(2);
    expect(groups[0]?.warnings.join(' ')).toContain('source URL');
    expect(groups[0]?.warnings.join(' ')).toContain('review item');
  });

  it('builds a work view and a conflict work-id list', () => {
    const dataWork = work('w1');
    const view = buildWorkConflictView(dataWork, observations, reviewItems);
    expect(view.work.id).toBe('w1');
    expect(view.observationCount).toBe(5);
    expect(view.conflictObservationCount).toBe(3);
    expect(view.groups).toHaveLength(2);
    expect(view.reviewItemIds).toEqual(['r1', 'r2']);
    expect(listConflictWorkIds(reviewItems)).toEqual(['w1']);
  });

  it('does not mutate observations or review items', () => {
    const before = JSON.stringify({ observations, reviewItems });
    buildSourceConflicts(observations, reviewItems);
    expect(JSON.stringify({ observations, reviewItems })).toBe(before);
  });
});