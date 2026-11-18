import { describe, expect, it } from 'vitest';
import { computeAniDna, computeChronotype, computeStreak, dnaCode, pickArchetype, type DnaTitleMeta } from '../lib/profile/ani-dna';

/** AniDNA: расчёты портрета зрителя (креативная фича кабинета). */

const titles = new Map<string, DnaTitleMeta>([
  ['a', { slug: 'a', name: 'A', genres: ['Экшен', 'Приключения'], episodes: 24 }],
  ['b', { slug: 'b', name: 'B', genres: ['Экшен', 'Фэнтези'], episodes: 12 }],
  ['c', { slug: 'c', name: 'C', genres: ['Романтика', 'Повседневность'], episodes: 12 }],
]);

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);

describe('computeAniDna', () => {
  it('считает часы, серии и жанры по истории', () => {
    const dna = computeAniDna({
      now: NOW,
      titles,
      history: [
        { slug: 'a', episode: 1, position: 1200, duration: 1440, updatedAt: NOW - 1000 },
        { slug: 'a', episode: 2, position: 720, duration: 1440, updatedAt: NOW - 2000 },
        { slug: 'b', episode: 1, position: 600, duration: 1440, updatedAt: NOW - DAY },
      ],
      lists: [
        { slug: 'a', status: 'completed' },
        { slug: 'b', status: 'watching' },
      ],
    });

    expect(dna.episodes).toBe(3);
    expect(dna.titles).toBe(2);
    // 1200 + 720 + 600 = 2520 с = 0.7 ч
    expect(dna.hours).toBe(0.7);
    expect(dna.topGenres[0].name).toBe('Экшен');
    expect(dna.completionRate).toBe(50);
    expect(dna.isColdStart).toBe(false);
  });

  it('не учитывает просмотр сверх длительности серии', () => {
    const dna = computeAniDna({
      now: NOW,
      titles,
      history: [{ slug: 'a', episode: 1, position: 999_999, duration: 1440, updatedAt: NOW }],
    });
    expect(dna.hours).toBe(0.4);
  });

  it('для неизвестной длительности берёт 24 минуты', () => {
    const dna = computeAniDna({
      now: NOW,
      titles,
      history: [{ slug: 'x', episode: 1, position: 60 * 60, duration: 0, updatedAt: NOW }],
    });
    expect(dna.hours).toBe(0.4);
  });

  it('пустая история не роняет расчёт и помечается холодным стартом', () => {
    const dna = computeAniDna({ now: NOW, titles, history: [] });
    expect(dna.episodes).toBe(0);
    expect(dna.topGenres).toEqual([]);
    expect(dna.isColdStart).toBe(true);
    expect(dna.archetype.id).toBe('season-scout');
  });

  it('жанры отсортированы по частоте и нормированы в проценты', () => {
    const dna = computeAniDna({
      now: NOW,
      titles,
      history: [
        { slug: 'a', episode: 1, position: 100, duration: 1440, updatedAt: NOW },
        { slug: 'b', episode: 1, position: 100, duration: 1440, updatedAt: NOW },
        { slug: 'c', episode: 1, position: 100, duration: 1440, updatedAt: NOW },
      ],
    });
    expect(dna.topGenres.map((g) => g.name)).toEqual(['Экшен', 'Приключения', 'Фэнтези', 'Романтика', 'Повседневность']);
    const total = dna.topGenres.reduce((sum, g) => sum + g.count, 0);
    expect(total).toBe(6);
    expect(Math.round(dna.topGenres[0].share)).toBe(33);
  });
});

describe('pickArchetype', () => {
  it('экшен тянет к сёнен-марафону', () => {
    const archetype = pickArchetype([{ name: 'Экшен', count: 10, share: 100 }]);
    expect(archetype.id).toBe('shonen-marathon');
    expect(archetype.colors).toHaveLength(2);
  });

  it('романтика — романтик слайсов', () => {
    expect(pickArchetype([{ name: 'Романтика', count: 6, share: 100 }]).id).toBe('romance-slice');
  });

  it('без жанров — нейтральный «сезонный скаут»', () => {
    expect(pickArchetype([]).id).toBe('season-scout');
  });
});

describe('computeStreak', () => {
  it('считает дни подряд, включая сегодня', () => {
    const history = [
      { slug: 'a', episode: 1, position: 1, duration: 1440, updatedAt: NOW },
      { slug: 'a', episode: 2, position: 1, duration: 1440, updatedAt: NOW - DAY },
      { slug: 'a', episode: 3, position: 1, duration: 1440, updatedAt: NOW - 2 * DAY },
    ];
    expect(computeStreak(history, NOW)).toBe(3);
  });

  it('стрик жив, если смотрели вчера', () => {
    expect(computeStreak([{ slug: 'a', episode: 1, position: 1, duration: 1, updatedAt: NOW - DAY }], NOW)).toBe(1);
  });

  it('пропуск двух дней обнуляет стрик', () => {
    expect(computeStreak([{ slug: 'a', episode: 1, position: 1, duration: 1, updatedAt: NOW - 2 * DAY }], NOW)).toBe(0);
  });
});

describe('computeChronotype', () => {
  it('определяет ночные и дневные сессии', () => {
    const night = [{ slug: 'a', episode: 1, position: 1, duration: 1, updatedAt: Date.UTC(2026, 10, 18, 23, 0, 0) }];
    const day = [{ slug: 'a', episode: 1, position: 1, duration: 1, updatedAt: Date.UTC(2026, 10, 18, 12, 0, 0) }];
    expect(computeChronotype(night)).toBe('night');
    expect(computeChronotype(day)).toBe('day');
    expect(computeChronotype([...night, ...day])).toBe('mixed');
  });
});

describe('dnaCode', () => {
  it('детерминирован и читаем', () => {
    expect(dnaCode('shonen-marathon', 120, 4)).toBe(dnaCode('shonen-marathon', 120, 4));
    expect(dnaCode('shonen-marathon', 120, 4)).toMatch(/^SM-[0-9]\d{3}$/);
  });
});
