import { describe, expect, it } from 'vitest';
import {
  buildDashboard,
  collectContradictoryAnimeIds,
  countPublishableWorks,
  countRuTitleMetrics,
  reviewQueueDelta,
} from '../lib/aninova3/comics/operations/dashboard';
import { REVIEW_REASONS, REVIEW_SEVERITIES, REVIEW_STATUSES } from '../lib/aninova3/comics/operations/model';
import { NOW, right, snapshot, work } from './fixtures/b3d-operations';

describe('B3-D quality dashboard', () => {
  it('counts metadata, quality and publication dimensions without double counting', () => {
    const data = snapshot();
    const dashboard = buildDashboard(data);

    expect(dashboard.metadata.works_total).toBe(3);
    expect(dashboard.metadata.works_by_status).toEqual({ draft: 2, approved: 1 });
    expect(Object.values(dashboard.metadata.works_by_status).reduce((sum, value) => sum + value, 0)).toBe(3);
    expect(dashboard.metadata.unknown_kind).toBe(1);
    expect(dashboard.metadata.ru_titles_present).toBe(2);
    expect(dashboard.metadata.ru_titles_verified).toBe(2);
    expect(dashboard.metadata.ru_titles_unverified).toBe(0);
    expect(dashboard.metadata.ru_titles_missing).toBe(1);
    expect(dashboard.metadata.ru_titles_name_mismatch).toBe(0);
    expect(dashboard.metadata.external_ids).toBe(3);
    expect(dashboard.metadata.aliases).toBe(2);
    expect(dashboard.metadata.people).toBe(3);
    expect(dashboard.metadata.credits).toBe(3);
    expect(dashboard.metadata.adaptations).toBe(1);
    expect(dashboard.metadata.source_observations).toBe(2);

    // Two conflict review items point at the same work: the queue count is 2,
    // the affected-work count must stay 1.
    expect(dashboard.quality.source_conflict_items).toBe(2);
    expect(dashboard.quality.source_conflict_works).toBe(1);
    expect(dashboard.quality.observation_conflicts).toBe(2);
    expect(dashboard.quality.ambiguous_external_ids).toBe(2);
    expect(dashboard.quality.duplicate_candidates).toBe(1);
    expect(dashboard.quality.unidentified_author_buckets).toBe(1);
    expect(dashboard.quality.identified_authors).toBe(1);
    expect(dashboard.quality.ambiguous_people_identities).toBe(1);
    expect(dashboard.quality.missing_provenance_items).toBe(1);
    expect(dashboard.quality.unknown_adult).toBe(2);
    expect(dashboard.quality.contradictory_anime_ids).toEqual([85]);

    expect(dashboard.publication.draft).toBe(2);
    expect(dashboard.publication.approved).toBe(1);
    expect(dashboard.publication.published).toBe(1);
    expect(dashboard.publication.adult).toBe(1);
    expect(dashboard.publication.verified_non_adult).toBe(0);
    expect(dashboard.publication.adult_unknown).toBe(2);
    expect(dashboard.publication.approved_rights).toBe(0);
    expect(dashboard.publication.chapters).toBe(0);
    expect(dashboard.publication.public_works).toBe(0);
    expect(dashboard.publication.publishable_works).toBe(0);

    expect(dashboard.review.total).toBe(9);
    expect(Object.values(dashboard.review.by_status).reduce((sum, value) => sum + value, 0)).toBe(9);
    expect(Object.values(dashboard.review.by_reason).reduce((sum, value) => sum + value, 0)).toBe(9);
    expect(Object.values(dashboard.review.by_severity).reduce((sum, value) => sum + value, 0)).toBe(9);
    for (const status of REVIEW_STATUSES) expect(dashboard.review.by_status[status]).toBeGreaterThanOrEqual(0);
    for (const reason of REVIEW_REASONS) expect(dashboard.review.by_reason[reason]).toBeGreaterThanOrEqual(0);
    for (const severity of REVIEW_SEVERITIES) expect(dashboard.review.by_severity[severity]).toBeGreaterThanOrEqual(0);
    expect(dashboard.review.by_status).toEqual({ open: 7, in_review: 1, resolved: 1, dismissed: 0 });
  });

  it('classifies RU titles as present/missing and verified/unverified without overlap', () => {
    const metrics = countRuTitleMetrics([
      work('t1', { title_ru: null, title_ru_status: 'source_verified' }),
      work('t2', { title_ru: '   ', title_ru_status: 'unverified' }),
      work('t3', { title_ru: 'Черновик', title_ru_status: 'candidate' }),
      work('t4', { title_ru: 'Не совпало', title_ru_status: 'name_mismatch' }),
      work('t5', { title_ru: 'Проверено', title_ru_status: 'source_verified' }),
      work('t6', { title_ru: 'Проверено редактором', title_ru_status: 'editorially_verified' }),
      work('t7', { title_ru: null, title_ru_status: 'name_mismatch' }),
    ]);
    expect(metrics).toEqual({ present: 4, verified: 2, unverified: 2, missing: 3, nameMismatch: 2 });
    expect(metrics.present).toBe(metrics.verified + metrics.unverified);
    expect(metrics.present + metrics.missing).toBe(7);
    // name_mismatch is a diagnostic status, not a fourth bucket; it can overlap missing.
    expect(metrics.nameMismatch).toBe(2);

    const dashboard = buildDashboard(snapshot({
      works: [
        work('m1', { title_ru: null }),
        work('m2', { title_ru: 'Не подтверждено', title_ru_status: 'unverified' }),
        work('m3', { title_ru: 'Mismatch', title_ru_status: 'name_mismatch' }),
      ],
    }));
    expect(dashboard.metadata.ru_titles_missing).toBe(1);
    expect(dashboard.metadata.ru_titles_unverified).toBe(2);
    expect(dashboard.metadata.ru_titles_present).toBe(2);
  });

  it('only treats two conflicting B1D direction hints as contradictory', () => {
    const items = snapshot().review_items;
    expect(collectContradictoryAnimeIds(items)).toEqual([85]);
    expect(collectContradictoryAnimeIds(items.filter((item) => item.id !== 'r5'))).toEqual([]);
  });

  it('reports comparison as unavailable without a previous snapshot', () => {
    const current = buildDashboard(snapshot());
    expect(reviewQueueDelta(current, null)).toEqual({
      available: false,
      total_delta: null,
      by_reason_delta: null,
    });
  });

  it('counts publishable works only with approved evidence-backed metadata rights', () => {
    const publishable = work('w4', {
      publication_status: 'approved',
      published_at: '2026-01-01T00:00:00.000Z',
      content_rating_status: 'verified_non_adult',
    });
    const valid = right('right-1', { work_id: 'w4' });
    expect(countPublishableWorks([publishable], [valid], NOW)).toBe(1);
    expect(countPublishableWorks([publishable], [], NOW)).toBe(0);
    expect(countPublishableWorks([publishable], [{ ...valid, evidence_ref: '  ' }], NOW)).toBe(0);
    expect(countPublishableWorks([publishable], [{ ...valid, reviewed_by: null }], NOW)).toBe(0);
    expect(countPublishableWorks([publishable], [{ ...valid, valid_until: '2025-01-01' }], NOW)).toBe(0);
    expect(countPublishableWorks([{ ...publishable, is_adult: true }], [valid], NOW)).toBe(0);
    expect(countPublishableWorks([{ ...publishable, content_rating_status: 'unknown' }], [valid], NOW)).toBe(0);
  });

  it('does not mutate the snapshot', () => {
    const data = snapshot();
    const before = JSON.stringify(data);
    buildDashboard(data);
    expect(JSON.stringify(data)).toBe(before);
  });
});