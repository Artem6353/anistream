import { describe, expect, it } from 'vitest';
import { buildEpisodeCoverageReport, isDirectEpisodeSource, toEpisodeRanges } from '../scripts/episode-coverage-core.mjs';

const source = (providerId: string, id = providerId) => ({
  id,
  providerId,
  embedUrl: 'https://video.example/' + id,
});
const record = (at: number, sources: unknown[], ttlMs = 1_000) => ({
  at,
  ttlMs,
  sources: { sources, sourcesUsed: [...new Set(sources.map((item) => (item as { providerId?: string }).providerId).filter(Boolean))] },
});

describe('direct episode source classification', () => {
  it('counts only exact sources from non-demo providers', () => {
    expect(isDirectEpisodeSource(source('kodik'))).toBe(true);
    expect(isDirectEpisodeSource(source('demo'))).toBe(false);
    expect(isDirectEpisodeSource({ ...source('kodik'), guessed: true })).toBe(false);
    expect(isDirectEpisodeSource({ ...source('kodik'), synthesized: true })).toBe(false);
    expect(isDirectEpisodeSource(source('kodik', 'kodik:voice:s12'))).toBe(false);
  });
});

describe('episode coverage report', () => {
  it('counts only fresh direct episodes in range and compresses all gaps', () => {
    const titles = [
      { slug: 'show', ru: 'Сериал', type: 'tv', status: 'finished', episodes: 4, shikimori: { id: 10 } },
      { slug: 'empty', ru: 'Без источников', type: 'tv', status: 'finished', episodes: 2 },
      { slug: 'future', ru: 'Анонс', type: 'tv', status: 'upcoming', episodes: 12 },
      { slug: 'hidden', ru: 'Скрытый', type: 'tv', status: 'finished', episodes: 1, hidden: true },
    ];
    const cache = {
      'ep:show:1': record(950, [source('kodik', 'k1'), source('cvh', 'c1')]),
      'ep:show:2': record(950, [{ ...source('kodik', 'k2'), synthesized: true }]),
      'ep:show:5': record(950, [source('kodik', 'k5')]),
      'ep:empty:1': record(100, [source('kodik', 'old')], 100),
      'ep:orphan:1': record(950, [source('kodik', 'orphan')]),
    };

    const report = buildEpisodeCoverageReport(titles, cache, { now: 1_000, defaultTtlMs: 1_000 });
    expect(report.summary.catalogTitles).toBe(4);
    expect(report.summary.eligibleTitles).toBe(2);
    expect(report.summary.upcomingTitles).toBe(1);
    expect(report.summary.eligibleExpectedEpisodes).toBe(6);
    expect(report.summary.directCoveredEpisodes).toBe(1);
    expect(report.summary.missingEpisodes).toBe(5);
    expect(report.summary.historicalDirectCoveredEpisodes).toBe(2);
    expect(report.summary.historicalMissingEpisodes).toBe(4);
    expect(report.summary.expiredDirectCacheRecordsIgnored).toBe(1);
    expect(report.summary.fullyCoveredTitles).toBe(0);
    expect(report.summary.partiallyCoveredTitles).toBe(1);
    expect(report.summary.noDirectSourceTitles).toBe(1);
    expect(report.summary.expiredCacheRecordsIgnored).toBe(1);
    expect(report.summary.recordsWithoutDirectSourcesIgnored).toBe(1);
    expect(report.summary.orphanCacheRecordsIgnored).toBe(1);
    expect(report.summary.outOfRangeDirectCacheRecordsIgnored).toBe(1);
    expect(report.summary.providerEpisodeCounts).toEqual({ cvh: 1, kodik: 1 });
    expect(report.titles[0].slug).toBe('empty');
    expect(report.titles[0].missingEpisodeRanges).toEqual([[1, 2]]);
    expect(report.titles[0].missingEpisodeRangesAnyAge).toEqual([[2, 2]]);
    expect(report.titles[0].historicalCoveragePercent).toBe(50);
    expect(report.titles[1].missingEpisodeRanges).toEqual([[2, 4]]);
    expect(report.titles[1].missingEpisodeRangesAnyAge).toEqual([[2, 4]]);
  });

  it('can include upcoming and hidden titles explicitly', () => {
    const report = buildEpisodeCoverageReport([
      { slug: 'visible', episodes: 1 },
      { slug: 'future', episodes: 3, status: 'upcoming' },
      { slug: 'hidden', episodes: 2, hidden: true },
    ], {}, { now: 10, includeUpcoming: true, includeHidden: true });
    expect(report.summary.eligibleTitles).toBe(3);
    expect(report.summary.eligibleExpectedEpisodes).toBe(6);
  });

  it('compresses sparse gaps into deterministic ranges', () => {
    expect(toEpisodeRanges([1, 2, 3, 7, 8, 10, 10])).toEqual([[1, 3], [7, 8], [10, 10]]);
  });
});
