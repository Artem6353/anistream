import { describe, expect, it } from 'vitest';
import {
  buildReviewDetail,
  collectSourceNames,
  parseReviewQuery,
  queryReviewQueue,
} from '../lib/aninova3/comics/operations/review';
import { alias, adaptation, externalId, observation, review, snapshot, work } from './fixtures/b3d-operations';

function queueFixture() {
  const works = [work('w1'), work('w2')];
  const items = Array.from({ length: 30 }, (_, index) => review(`r${index}`, {
    work_id: index % 2 === 0 ? 'w1' : 'w2',
    priority: index,
    status: index % 5 === 0 ? 'resolved' : index % 3 === 0 ? 'in_review' : 'open',
    reason: index % 3 === 0 ? 'source_conflict' : 'manual',
    details: index % 4 === 0 ? { source_name: 'shikimori', field: 'chapters' } : { source_name: 'anilist' },
    created_at: `2026-05-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
  return { works, items };
}

describe('B3-D review queue operations', () => {
  it('parses filters, valid enums, dates and safe page bounds', () => {
    const query = parseReviewQuery({
      reason: 'source_conflict',
      status: 'in_review',
      work_id: 'w1',
      priority: '60',
      source: 'Shikimori',
      source_conflict: 'true',
      ambiguous_external_id: '1',
      created_from: '2026-05-01',
      created_to: '2026-05-31',
      q: '  key-w1  ',
      group_by_work: 'true',
      sort: 'created_at',
      dir: 'asc',
      page: '2',
      page_size: '10',
    });
    expect(query.reason).toBe('source_conflict');
    expect(query.status).toBe('in_review');
    expect(query.workId).toBe('w1');
    expect(query.priorityMin).toBe(60);
    expect(query.source).toBe('shikimori');
    expect(query.sourceConflict).toBe(true);
    expect(query.ambiguousExternalId).toBe(true);
    expect(query.createdFrom).toBe('2026-05-01T00:00:00.000Z');
    expect(query.createdTo).toBe('2026-05-31T23:59:59.999Z');
    expect(query.q).toBe('key-w1');
    expect(query.groupByWork).toBe(true);
    expect(query.sort).toBe('created_at');
    expect(query.dir).toBe('asc');
    expect(query.page).toBe(2);
    expect(query.pageSize).toBe(10);
    expect(parseReviewQuery({ reason: 'not-a-reason', status: 'bad', page_size: '9999' })).toMatchObject({
      reason: undefined,
      status: undefined,
      pageSize: 100,
    });
  });

  it('filters by reason, status, work, source, priority and text', () => {
    const { works, items } = queueFixture();
    const base = parseReviewQuery({});
    const sourceConflict = queryReviewQueue(items, works, { ...base, sourceConflict: true });
    expect(sourceConflict.total).toBe(10);
    expect(sourceConflict.items.every((item) => item.reason === 'source_conflict')).toBe(true);

    const source = queryReviewQueue(items, works, { ...base, source: 'shikimori' });
    expect(source.total).toBe(8);
    expect(source.items.every((item) => collectSourceNames(item).includes('shikimori'))).toBe(true);

    const text = queryReviewQueue(items, works, { ...base, q: 'key-w1' });
    expect(text.total).toBe(15);
    expect(text.items.every((item) => item.work_id === 'w1')).toBe(true);

    const dates = queryReviewQueue(items, works, {
      ...base,
      createdFrom: '2026-05-10T00:00:00.000Z',
      createdTo: '2026-05-12T23:59:59.999Z',
    });
    expect(dates.items.every((item) => {
      const time = Date.parse(item.created_at);
      return time >= Date.parse('2026-05-10T00:00:00.000Z') && time <= Date.parse('2026-05-12T23:59:59.999Z');
    })).toBe(true);
  });

  it('paginates after filtering and sorts by priority', () => {
    const { works, items } = queueFixture();
    const base = parseReviewQuery({});
    const page = queryReviewQueue(items, works, { ...base, page: 2, pageSize: 10 });
    expect(page.total).toBe(30);
    expect(page.pageCount).toBe(3);
    expect(page.page).toBe(2);
    expect(page.items).toHaveLength(10);
    expect(page.items[0]?.priority).toBe(19);
    expect(page.items[9]?.priority).toBe(10);
    expect(page.summary.total).toBe(30);

    const clamped = queryReviewQueue(items, works, { ...base, page: 99, pageSize: 10 });
    expect(clamped.page).toBe(3);
  });

  it('groups by work with stable group counts', () => {
    const { works, items } = queueFixture();
    const base = parseReviewQuery({ group_by_work: 'true', page_size: '10' });
    const grouped = queryReviewQueue(items, works, base);
    expect(grouped.total).toBe(30);
    expect(grouped.groups).toHaveLength(2);
    expect(grouped.pageCount).toBe(1);
    expect(grouped.groups.map((group) => group.count).sort((a, b) => a - b)).toEqual([15, 15]);
    expect(grouped.groups[0]?.label).toContain('key-w');
    expect(grouped.groups[0]?.items.length).toBe(15);
  });

  it('builds an exact review detail with all provenance and related items', () => {
    const data = snapshot();
    const item = data.review_items.find((entry) => entry.id === 'r1');
    if (!item) throw new Error('fixture item missing');
    const detail = buildReviewDetail({
      item,
      work: data.works[0],
      reviewItems: data.review_items,
      observations: [observation('o1'), observation('o2', { source_url: null })],
      externalIds: [externalId('e1')],
      aliases: [alias('al1')],
      adaptations: [adaptation('ad1')],
    });
    expect(detail.exactWorkLink).toBe(true);
    expect(detail.observations).toHaveLength(2);
    expect(detail.provenance).toHaveLength(5);
    expect(detail.relatedItems.map((entry) => entry.id)).toContain('r1');
    expect(detail.relatedItems.every((entry) => entry.work_id === 'w1')).toBe(true);
    expect(detail.provenance.some((entry) => entry.sourceUrl === null)).toBe(true);
    expect(detail.warnings.join(' ')).toContain('source URL');
    expect(detail.sourceNames).toEqual([]);

    const unlinked = buildReviewDetail({
      item: { ...item, work_id: null },
      work: null,
      reviewItems: [],
      observations: [],
      externalIds: [],
      aliases: [],
      adaptations: [],
    });
    expect(unlinked.exactWorkLink).toBe(true);
    expect(unlinked.warnings.join(' ')).toContain('не привязан');
  });

  it('does not mutate input items while filtering or grouping', () => {
    const { works, items } = queueFixture();
    const before = JSON.stringify(items);
    queryReviewQueue(items, works, parseReviewQuery({ group_by_work: 'true' }));
    expect(JSON.stringify(items)).toBe(before);
  });
});