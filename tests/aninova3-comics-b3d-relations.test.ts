import { describe, expect, it } from 'vitest';
import { buildRelationInspection } from '../lib/aninova3/comics/operations/relations';
import { adaptation, review, work } from './fixtures/b3d-operations';

function relationFixture() {
  const works = [work('w1'), work('w2')];
  const adaptations = [
    adaptation('a1', { anime_id: 85, raw_relation_type: 'ADAPTATION', normalized_relation_type: 'ADAPTATION' }),
    adaptation('a2', { anime_id: 2291, comic_work_id: 'w2', raw_relation_type: 'CHARACTER', normalized_relation_type: 'CHARACTER' }),
    adaptation('a3', { anime_id: 9963, raw_relation_type: 'SIDE_STORY', normalized_relation_type: 'SIDE_STORY' }),
    adaptation('a4', { anime_id: 164212, raw_relation_type: 'SPIN_OFF', normalized_relation_type: 'SPIN_OFF' }),
    adaptation('a5', { anime_id: 999, raw_relation_type: 'RELATED', normalized_relation_type: 'RELATED' }),
    adaptation('a6', { anime_id: 1000, is_primary: true, verification_status: 'source_verified' }),
    adaptation('a7', {
      anime_id: 1001,
      direction: 'comic_is_source',
      confidence_level: 'confirmed',
      is_primary: true,
      is_public: true,
      verification_status: 'recorded',
    }),
  ];
  const reviewItems = [
    review('h1', { reason: 'relation_evidence_conflict', details: { b1d_category: 'comicAdaptsAnime', anime_ids: [85], source_name: 'b1d' } }),
    review('h2', { reason: 'relation_evidence_conflict', details: { b1d_category: 'adaptationAfterAnime', anime_ids: [85], source_name: 'b1d' } }),
    review('h3', { reason: 'relation_evidence_conflict', details: { b1d_category: 'duplicateMal', anime_ids: [2291] } }),
  ];
  return { works, adaptations, reviewItems };
}

describe('B3-D relation inspector', () => {
  it('preserves raw and normalized types and never invents RELATED', () => {
    const { works, adaptations, reviewItems } = relationFixture();
    const inspection = buildRelationInspection(adaptations, works, reviewItems);
    const character = inspection.links.find((link) => link.animeId === 2291);
    expect(character?.rawType).toBe('CHARACTER');
    expect(character?.normalizedType).toBe('CHARACTER');
    expect(character?.normalizedType).not.toBe('RELATED');
    const sideStory = inspection.links.find((link) => link.animeId === 9963);
    expect(sideStory?.normalizedType).toBe('SIDE_STORY');
    const spinOff = inspection.links.find((link) => link.animeId === 164212);
    expect(spinOff?.normalizedType).toBe('SPIN_OFF');
    const unsupported = inspection.links.find((link) => link.animeId === 999);
    expect(unsupported?.knownRawType).toBe(false);
    expect(unsupported?.normalizedType).toBe('RELATED');
    expect(unsupported?.policyWarnings.join(' ')).toContain('RELATED');
  });

  it('keeps recorded direction/confidence unknown and flags unsafe primary/public flags', () => {
    const { works, adaptations, reviewItems } = relationFixture();
    const inspection = buildRelationInspection(adaptations, works, reviewItems);
    const recorded = inspection.links.find((link) => link.animeId === 1001);
    expect(recorded?.verificationStatus).toBe('recorded');
    expect(recorded?.direction).toBe('comic_is_source');
    expect(recorded?.confidence).toBe('confirmed');
    expect(recorded?.isPrimary).toBe(true);
    expect(recorded?.isPublic).toBe(true);
    expect(recorded?.policyWarnings.join(' ')).toContain('направление');
    expect(recorded?.policyWarnings.join(' ')).toContain('confidence');
    expect(recorded?.policyWarnings.join(' ')).toContain('primary/public');
    expect(inspection.autoConfirmation).toBe(false);
    expect(inspection.directionDecision).toBe('not_made');
  });

  it('does not treat ADAPTATION as a primary source', () => {
    const { works, adaptations, reviewItems } = relationFixture();
    const inspection = buildRelationInspection(adaptations, works, reviewItems);
    const adaptationLink = inspection.links.find((link) => link.animeId === 1000);
    expect(adaptationLink?.normalizedType).toBe('ADAPTATION');
    expect(adaptationLink?.policyWarnings.join(' ')).toContain('первоисточник');
    expect(inspection.summary.primary).toBe(2);
  });

  it('highlights the four contradictory B1D anime ids without deciding direction', () => {
    const { works, adaptations, reviewItems } = relationFixture();
    const inspection = buildRelationInspection(adaptations, works, reviewItems);
    expect(inspection.contradictions.map((entry) => entry.animeId)).toEqual([85]);
    expect(inspection.knownContradictoryIds).toEqual([85, 2291, 9963, 164212]);
    expect(inspection.highlighted.map((link) => link.animeId).sort((a, b) => a - b)).toEqual([85, 2291, 9963, 164212]);
    expect(inspection.links.find((link) => link.animeId === 85)?.hints).toHaveLength(2);
    expect(inspection.links.find((link) => link.animeId === 85)?.isContradictory).toBe(true);
    for (const link of inspection.highlighted) {
      expect(link.direction).toBe('unknown');
      expect(link.confidence).toBe('unknown');
      expect(link.isPrimary).toBe(false);
      expect(link.isPublic).toBe(false);
    }
  });

  it('does not mutate relations or review hints', () => {
    const { works, adaptations, reviewItems } = relationFixture();
    const before = JSON.stringify({ adaptations, reviewItems });
    buildRelationInspection(adaptations, works, reviewItems);
    expect(JSON.stringify({ adaptations, reviewItems })).toBe(before);
  });
});