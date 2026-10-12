import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Title } from '@/lib/types';
import { episodeCount, episodeInfo, maxKnownEpisode } from '@/lib/episodes';
import { releasedOverridesSize, setReleasedOverrides } from '@/lib/episode-overrides';
/* Маршруты читают границу из БД асинхронно (lib/episode-route:validEpisodeDb),
   поэтому в тестах мокаем fetch и зовём именно её. Динамический импорт — чтобы
   vi.resetModules() не разводил экземпляры модулей. */
const loadValidEpisode = async () => (await import('@/lib/episode-route')).validEpisodeDb;

/**
 * Задача 1 аудита: «сколько серий вышло» берётся из БД, а не из устаревшего каталога.
 *
 * Реальный кейс: у «Ван-Пис» в titles.json поле airing заморожено на июне 2025
 * (максимум 1134), Shikimori отдаёт episodes_aired=1180, AniList знает график до 1189.
 * Без БД границей оставалось 1134 и /anime/one-piece/1135…1180 отдавали 404.
 */

function t(patch: Partial<Title>): Title {
  return {
    anilistId: 21,
    slug: 'one-piece',
    ru: 'Ван-Пис (1999)',
    romaji: 'ONE PIECE',
    type: 'tv',
    year: 1999,
    status: 'ongoing',
    episodes: null,
    score: 8.7,
    favourites: 109202,
    genres: ['action'],
    poster: '',
    description: '',
    ...patch,
  } as Title;
}

const airing = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ ep: from + i, at: 1_700_000_000_000 + i * 86_400_000 }));

/** «Ван-Пис» как в каталоге после repair: airing до 1134, episodesReleased 1134. */
const onePieceCatalog = () => t({ airing: airing(1123, 1134), episodesReleased: 1134 });

/* ------------------------- мок Supabase REST ------------------------- */

const SUPA = 'https://project.supabase.co';

type PrimeMocks = {
  episodeProgress?: { anime_id: number; max_number: number }[];
  airingProgress?: { anime_id: number; max_episode: number }[];
  titles?: { id: number; episodes_released: number | null }[];
  failAll?: boolean;
};

function mockSupabase(cfg: PrimeMocks) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (cfg.failAll) return new Response('boom', { status: 500 });
      const body = url.includes('/episode_progress')
        ? cfg.episodeProgress ?? []
        : url.includes('/airing_progress')
          ? cfg.airingProgress ?? []
          : url.includes('/titles?')
            ? cfg.titles ?? []
            : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return calls;
}

async function loadPrime() {
  vi.resetModules();
  return import('@/lib/episode-data');
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
  setReleasedOverrides(new Map());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  setReleasedOverrides(new Map());
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

describe('primeEpisodeData: максимум из БД перекрывает устаревший каталог', () => {
  it('каталог 1134 + БД 1180 → 1180', async () => {
    mockSupabase({
      episodeProgress: [],
      airingProgress: [{ anime_id: 21, max_episode: 1189 }],
      titles: [{ id: 21, episodes_released: 1180 }],
    });
    const { primeEpisodeData } = await loadPrime();
    const res = await primeEpisodeData();

    expect(res.configured).toBe(true);
    expect(res.updated).toBe(1);
    expect(res.from).toContain('titles');
    expect(res.from).toContain('airing_schedule');
    /* Читаем override из ТОГО ЖЕ экземпляра модуля, куда его положил прайм
       (vi.resetModules() создаёт новый граф модулей). */
    const overrides = await import('@/lib/episode-overrides');
    const { episodeInfo: info2, episodeCount: count2 } = await import('@/lib/episodes');
    expect(overrides.getReleasedOverride(21)).toBe(1189); // максимум из airing_schedule и titles

    const info = info2(onePieceCatalog());
    expect(info.released).toBe(1189);
    expect(count2(onePieceCatalog())).toBe(1189);
    expect(info.totalUnknown).toBe(true);
  });

  it('таблица episodes приоритетнее airing_schedule, когда номер больше', async () => {
    mockSupabase({
      episodeProgress: [{ anime_id: 21, max_number: 1195 }],
      airingProgress: [{ anime_id: 21, max_episode: 1189 }],
      titles: [{ id: 21, episodes_released: 1180 }],
    });
    const { primeEpisodeData } = await loadPrime();
    await primeEpisodeData();
    const overrides = await import('@/lib/episode-overrides');
    expect(overrides.getReleasedOverride(21)).toBe(1195);
  });

  it('БД меньше каталога → override не ставится (регресс не откатывает прогресс)', async () => {
    mockSupabase({ titles: [{ id: 21, episodes_released: 900 }] });
    const { primeEpisodeData } = await loadPrime();
    const res = await primeEpisodeData();
    expect(res.updated).toBe(0);
    const overrides = await import('@/lib/episode-overrides');
    const { episodeCount: count } = await import('@/lib/episodes');
    expect(overrides.getReleasedOverride(21)).toBeUndefined();
    expect(count(onePieceCatalog())).toBe(1134);
  });

  it('БД пуста → fallback на каталог', async () => {
    const calls = mockSupabase({});
    const { primeEpisodeData } = await loadPrime();
    const res = await primeEpisodeData();
    expect(calls.length).toBe(3); // три источника опросили
    expect(res.updated).toBe(0);
    expect(releasedOverridesSize()).toBe(0);
    expect(episodeCount(onePieceCatalog())).toBe(1134);
  });

  it('Supabase недоступен (500) → не бросает, остаётся каталог', async () => {
    mockSupabase({ failAll: true });
    const { primeEpisodeData } = await loadPrime();
    const res = await primeEpisodeData();
    expect(res.updated).toBe(0);
    expect(episodeCount(onePieceCatalog())).toBe(1134);
  });

  it('Supabase не настроен → configured=false, запросов нет', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { primeEpisodeData } = await loadPrime();
    const res = await primeEpisodeData();
    expect(res).toEqual({ updated: 0, from: [], configured: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('граница серий: 404 за пределами вышедшего, 200 на границе', () => {
  it('БД недоступна → граница из каталога: 1134 есть, 1135 — 404', async () => {
    const validEpisode = await loadValidEpisode();
    const title = onePieceCatalog();
    expect(await validEpisode(title, '1134')).toBe(1134);
    expect(await validEpisode(title, '1135')).toBeNull();
    expect(await validEpisode(title, '25')).toBe(25);
  });

  it('БД отдаёт 1180 → граница 1180: серия 1180 есть, 1181 — 404 (критерий приёмки задачи 1)', async () => {
    mockSupabase({ titles: [{ id: 21, episodes_released: 1180 }] });
    const validEpisode = await loadValidEpisode();
    const title = onePieceCatalog();
    expect(await validEpisode(title, '1135')).toBe(1135);
    expect(await validEpisode(title, '1180')).toBe(1180);
    expect(await validEpisode(title, '1181')).toBeNull();
  });

  it('airing_schedule знает больше, чем titles.episodes_released → берём максимум', async () => {
    mockSupabase({
      airingProgress: [{ anime_id: 21, max_episode: 1189 }],
      titles: [{ id: 21, episodes_released: 1180 }],
    });
    const validEpisode = await loadValidEpisode();
    expect(await validEpisode(onePieceCatalog(), '1189')).toBe(1189);
    expect(await validEpisode(onePieceCatalog(), '1190')).toBeNull();
  });

  it('мусор в номере серии по-прежнему не проходит', async () => {
    const validEpisode = await loadValidEpisode();
    const title = onePieceCatalog();
    expect(await validEpisode(title, 'abc')).toBeNull();
    expect(await validEpisode(title, '0')).toBeNull();
    expect(await validEpisode(title, '-3')).toBeNull();
    expect(await validEpisode(title, '12.5')).toBeNull();
  });
});

describe('прежние правила не сломаны', () => {
  it('фильм → 1 серия, override на него не действует', () => {
    setReleasedOverrides(new Map([[777, 50]]));
    const movie = t({ anilistId: 777, type: 'movie', status: 'finished', episodes: null, airing: [] });
    expect(episodeCount(movie)).toBe(1);
    expect(episodeInfo(movie).isSingle).toBe(true);
  });

  it('анонс → числа нет, override игнорируется', () => {
    setReleasedOverrides(new Map([[21, 1189]]));
    const upcoming = t({ status: 'upcoming', episodes: 12, airing: [] });
    expect(episodeCount(upcoming)).toBeNull();
  });

  it('завершённый сериал → episodes из источника, override не подмешивается', () => {
    setReleasedOverrides(new Map([[555, 900]]));
    const finished = t({ anilistId: 555, status: 'finished', episodes: 26, airing: [] });
    expect(episodeCount(finished)).toBe(26);
  });

  it('override применяется только к своему anilistId', () => {
    setReleasedOverrides(new Map([[21, 1189]]));
    expect(maxKnownEpisode(t({ anilistId: 21, airing: [] }))).toBe(1189);
    expect(maxKnownEpisode(t({ anilistId: 999, airing: [] }))).toBe(0);
    expect(maxKnownEpisode({ airing: airing(3, 7) })).toBe(7); // без id — только каталог
  });
});
