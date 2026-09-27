'use client';

/** Ачивки (ТЗ блок 18.1): 32 достижения с уровнями, прогрессом и тостом.
    Хранение: anistream:achievements = { [id]: { unlockedAt } } (ключ НЕ переименовывать;
    legacy-формат { id: number } читается обратно совместимо).
    Счётчики событий: anistream:ach_counters (новый ключ, существующие не трогаем). */
import { library } from './library';
import type { Title } from './types';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'secret';

export interface AchCtx {
  episodes: number;
  watchSec: number;
  listsCount: number;
  bookmarks: number;
  reviews: number;
  comments: number;
  likes: number;
  ratings: number;
  genresWatched: number;
  genreCounts: Record<string, number>;
  movies: number;
  daysStreak: number;
  sections: number;
  themeChanges: number;
  speed2Count: number;
  voices: number;
  maxEpisodesPerDay: number;
  maxSecPerDay: number;
  nightOwl: boolean;
  unlockedCount: number; // обычных (не секретных)
}

export interface AchievementMeta {
  id: string;
  tier: AchievementTier;
  title: string;
  desc: string;
  how: string;
  goal: number;
  progress: (c: AchCtx) => number;
  done: (c: AchCtx) => boolean;
}

const A = (id: string, tier: AchievementTier, title: string, desc: string, how: string, goal: number, progress: (c: AchCtx) => number, done: (c: AchCtx) => boolean): AchievementMeta => ({ id, tier, title, desc, how, goal, progress, done });

export const ACHIEVEMENTS: AchievementMeta[] = [
  // 🥉 Бронза (10)
  A('first_episode', 'bronze', 'Первый шаг', 'Посмотреть 1 серию', 'Откройте любую серию и посмотрите хотя бы минуту', 1, (c) => c.episodes, (c) => c.episodes >= 1),
  A('ten_episodes', 'bronze', 'Десятка', '10 серий просмотрено', '10 серий в истории', 10, (c) => c.episodes, (c) => c.episodes >= 10),
  A('five_lists', 'bronze', 'Знакомство', '5 тайтлов в списках', 'Добавьте 5 тайтлов в списки статусов', 5, (c) => c.listsCount, (c) => c.listsCount >= 5),
  A('first_review', 'bronze', 'Оратор', 'Первый отзыв', 'Напишите отзыв', 1, (c) => c.reviews, (c) => c.reviews >= 1),
  A('first_like', 'bronze', 'Первый лайк', 'Лайк чужому отзыву', 'Поставьте лайк отзыву', 1, (c) => c.likes, (c) => c.likes >= 1),
  A('ten_bookmarks', 'bronze', 'Коллекционер', '10 закладок', '10 тайтлов в закладках', 10, (c) => c.bookmarks, (c) => c.bookmarks >= 10),
  A('all_sections', 'bronze', 'Исследователь', '5 разделов сайта', 'Главная, каталог, топ, расписание, профиль', 5, (c) => c.sections, (c) => c.sections >= 5),
  A('first_theme', 'bronze', 'Стилист', 'Сменить тему', 'Поменяйте тему оформления', 1, (c) => c.themeChanges, (c) => c.themeChanges >= 1),
  A('ten_ratings', 'bronze', 'В точку', '10 оценок тайтлам', 'Поставьте 10 оценок в отзывах', 10, (c) => c.ratings, (c) => c.ratings >= 10),
  A('first_hour', 'bronze', 'Первый час', '1 час просмотра', 'Суммарно час просмотренного', 3600, (c) => c.watchSec, (c) => c.watchSec >= 3600),
  // 🥈 Серебро (10)
  A('hundred_episodes', 'silver', 'Сотка', '100 серий', '100 серий в истории', 100, (c) => c.episodes, (c) => c.episodes >= 100),
  A('marathoner', 'silver', 'Марафонец', '10 серий за день', '10 серий с датой просмотра в один день', 10, (c) => c.maxEpisodesPerDay, (c) => c.maxEpisodesPerDay >= 10),
  A('hundred_hours', 'silver', 'Сто часов', '100 часов просмотра', 'Суммарно 100 часов', 360000, (c) => c.watchSec, (c) => c.watchSec >= 360000),
  A('fifty_lists', 'silver', 'Коллекционер+', '50 тайтлов в списках', '50 тайтлов в списках статусов', 50, (c) => c.listsCount, (c) => c.listsCount >= 50),
  A('ten_reviews', 'silver', 'Критик', '10 отзывов', 'Напишите 10 отзывов', 10, (c) => c.reviews, (c) => c.reviews >= 10),
  A('fifty_comments', 'silver', 'Комментатор', '50 комментариев', '50 ответов в ветках', 50, (c) => c.comments, (c) => c.comments >= 50),
  A('romantic', 'silver', 'Романтик', '20 романтик-тайтлов', '20 тайтлов жанра романтика в истории', 20, (c) => c.genreCounts['romance'] ?? 0, (c) => (c.genreCounts['romance'] ?? 0) >= 20),
  A('action_master', 'silver', 'Экшен-мастер', '20 экшен-тайтлов', '20 тайтлов жанра экшен в истории', 20, (c) => c.genreCounts['action'] ?? 0, (c) => (c.genreCounts['action'] ?? 0) >= 20),
  A('all_genres', 'silver', 'Всеядный', '10 жанров', 'Тайтлы 10 разных жанров в истории', 10, (c) => c.genresWatched, (c) => c.genresWatched >= 10),
  A('night_owl', 'silver', 'Ночной житель', 'Серия в 3–6 утра', 'Посмотрите серию между 03:00 и 06:00', 1, (c) => (c.nightOwl ? 1 : 0), (c) => c.nightOwl),
  // 🥇 Золото (5)
  A('five_hundred_episodes', 'gold', 'Полтысячи', '500 серий', '500 серий в истории', 500, (c) => c.episodes, (c) => c.episodes >= 500),
  A('movie_buff', 'gold', 'Киноман', '50 фильмов', '50 полных метров в истории', 50, (c) => c.movies, (c) => c.movies >= 50),
  A('thirty_day_streak', 'gold', 'Постоянный', '30 дней подряд', 'Заходите 30 дней без перерыва', 30, (c) => c.daysStreak, (c) => c.daysStreak >= 30),
  A('librarian', 'gold', 'Библиотекарь', '200 тайтлов в списках', '200 тайтлов в списках статусов', 200, (c) => c.listsCount, (c) => c.listsCount >= 200),
  A('fifty_reviews', 'gold', 'Рецензент', '50 отзывов', 'Напишите 50 отзывов', 50, (c) => c.reviews, (c) => c.reviews >= 50),
  // 💎 Платина (3)
  A('thousand_episodes', 'platinum', 'Легенда', '1000 серий', '1000 серий в истории', 1000, (c) => c.episodes, (c) => c.episodes >= 1000),
  A('thousand_hours', 'platinum', 'Тысяча часов', '1000 часов просмотра', 'Суммарно 1000 часов', 3600000, (c) => c.watchSec, (c) => c.watchSec >= 3600000),
  A('hundred_day_streak', 'platinum', 'Преданный', '100 дней подряд', '100 дней без перерыва', 100, (c) => c.daysStreak, (c) => c.daysStreak >= 100),
  // 🌟 Секретные (4) — видны только после получения
  A('night_marathon', 'secret', 'Ночной марафон', '24 часа за сутки', 'Секрет: 24 часа просмотра в одни сутки', 86400, (c) => c.maxSecPerDay, (c) => c.maxSecPerDay >= 86400),
  A('speed_demon', 'secret', 'Скорость', 'x2 пятьдесят раз', 'Секрет: включите скорость x2 50 раз', 50, (c) => c.speed2Count, (c) => c.speed2Count >= 50),
  A('voice_collector', 'secret', 'Озвучек много', '10 разных озвучек', 'Секрет: смените озвучку в плеере 10 раз', 10, (c) => c.voices, (c) => c.voices >= 10),
  A('legendary', 'secret', 'Легендарный', 'Все 28 обычных', 'Секрет: соберите все обычные ачивки', 28, (c) => c.unlockedCount, (c) => c.unlockedCount >= 28),
];

export const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const TIER_LABELS: Record<AchievementTier, string> = {
  bronze: '🥉 Бронза',
  silver: '🥈 Серебро',
  gold: '🥇 Золото',
  platinum: '💎 Платина',
  secret: '🌟 Секретные',
};
export const TIER_EMOJI: Record<AchievementTier, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎', secret: '🌟' };

/* ---------- хранилище ---------- */
import { scopedKey } from './library';

// ключи вычисляются динамически: данные привязаны к аккаунту (scope)
const kAch = () => scopedKey('anistream:achievements');
const kCounters = () => scopedKey('anistream:ach_counters');
const kGenres = () => scopedKey('anistream:ach_genres');
const kExtra = () => scopedKey('anistream:ach_extra');
const kWatched = () => scopedKey('anistream:ach_watched');

export interface Counters {
  likes: number;
  reviews: number;
  comments: number;
  ratings: number;
  themeChanges: number;
  speed2: number;
  voices: number;
  sections: string[];
}
const DEFAULT_COUNTERS: Counters = { likes: 0, reviews: 0, comments: 0, ratings: 0, themeChanges: 0, speed2: 0, voices: 0, sections: [] };

function readJson<T>(key: string, fb: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fb;
  } catch {
    return fb;
  }
}
export function readUnlocked(): Record<string, { unlockedAt: number }> {
  const raw = readJson<Record<string, unknown>>(kAch(), {});
  const out: Record<string, { unlockedAt: number }> = {};
  for (const [k, v] of Object.entries(raw)) {
    // обратная совместимость: legacy { id: number }
    out[k] = typeof v === 'number' ? { unlockedAt: v } : (v as { unlockedAt: number });
  }
  return out;
}
function writeUnlocked(v: Record<string, { unlockedAt: number }>) {
  try {
    localStorage.setItem(kAch(), JSON.stringify(v));
  } catch {}
}
export function readCounters(): Counters {
  return { ...DEFAULT_COUNTERS, ...readJson<Partial<Counters>>(kCounters(), {}) };
}
function writeCounters(c: Counters) {
  try {
    localStorage.setItem(kCounters(), JSON.stringify(c));
  } catch {}
}

/* ---------- контекст проверки ---------- */
export function buildContext(streakCurrent: number): AchCtx {
  const { history, bookmarks, lists } = library.state;
  const counters = readCounters();
  const bySlug = new Map<string, Title>();
  let watchSec = 0;
  const perDayEp = new Map<string, number>();
  const perDaySec = new Map<string, number>();
  const genreCounts: Record<string, number> = {};
  const seenSlug = new Set<string>();
  let movies = 0;
  let nightOwl = false;
  for (const h of history) {
    watchSec += Math.max(0, Math.min(h.position || 0, h.duration || h.position || 0));
    const day = new Date(h.updatedAt ?? 0);
    const dk = day.toISOString().slice(0, 10);
    perDayEp.set(dk, (perDayEp.get(dk) ?? 0) + 1);
    perDaySec.set(dk, (perDaySec.get(dk) ?? 0) + (h.position || 0));
    const hour = day.getHours();
    if (hour >= 3 && hour < 6) nightOwl = true;
    if (seenSlug.has(h.slug)) continue;
    seenSlug.add(h.slug);
    bySlug.set(h.slug, bySlug.get(h.slug) ?? (null as unknown as Title));
  }
  // жанры/фильмы — по каталогу истории (titles приходят из useTitles на страницах;
  // здесь лёгкий путь: жанры считаем из событий trackEvent('watch', {genres}))
  const g = readJson<Record<string, number>>(kGenres(), {});
  Object.assign(genreCounts, g);
  const st = readJson<{ movies?: number; ratingsSum?: number }>(kExtra(), {});
  movies = st.movies ?? 0;
  const unlocked = readUnlocked();
  return {
    episodes: history.length,
    watchSec,
    listsCount: Object.keys(lists).length,
    bookmarks: bookmarks.length,
    reviews: counters.reviews,
    comments: counters.comments,
    likes: counters.likes,
    ratings: counters.ratings,
    genresWatched: Object.keys(genreCounts).length,
    genreCounts,
    movies,
    daysStreak: streakCurrent,
    sections: counters.sections.length,
    themeChanges: counters.themeChanges,
    speed2Count: counters.speed2,
    voices: counters.voices,
    maxEpisodesPerDay: Math.max(0, ...perDayEp.values()),
    maxSecPerDay: Math.max(0, ...perDaySec.values()),
    nightOwl,
    unlockedCount: ACHIEVEMENTS.filter((a) => a.tier !== 'secret' && unlocked[a.id]).length,
  };
}

export const ACH_EVENT = 'anistream:achievement';

/** Проверить все ачивки; новые разблокировать и разослать тост-события. */
export function checkAchievements(streakCurrent: number): string[] {
  if (typeof window === 'undefined') return [];
  const ctx = buildContext(streakCurrent);
  const unlocked = readUnlocked();
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked[a.id]) continue;
    if (a.id === 'legendary' && ctx.unlockedCount < 28) continue;
    if (a.done(ctx)) {
      unlocked[a.id] = { unlockedAt: Date.now() };
      fresh.push(a.id);
    }
  }
  if (fresh.length) {
    writeUnlocked(unlocked);
    for (const id of fresh) window.dispatchEvent(new CustomEvent(ACH_EVENT, { detail: { id } }));
  }
  return fresh;
}

/* ---------- события-триггеры ---------- */
export type TrackType = 'watch' | 'bookmarks' | 'lists' | 'review' | 'comment' | 'like' | 'rating' | 'theme' | 'section' | 'speed2' | 'voice' | 'streak';

export function trackEvent(type: TrackType, payload?: { genres?: string[]; movie?: boolean; section?: string; streak?: number; rating?: number; slug?: string }) {
  if (typeof window === 'undefined') return;
  const c = readCounters();
  let streak = payload?.streak ?? 0;
  switch (type) {
    case 'watch': {
      // Аудит P1-3: инкремент жанров/фильмов только при ПЕРВОМ просмотре тайтла
      const slug = payload?.slug;
      const watched = new Set(readJson<string[]>(kWatched(), []));
      const firstTime = Boolean(slug) && !watched.has(slug!);
      if (slug && firstTime) {
        watched.add(slug);
        try {
          localStorage.setItem(kWatched(), JSON.stringify([...watched].slice(-5000)));
        } catch {}
      }
      if (firstTime && payload?.genres?.length) {
        const g = readJson<Record<string, number>>(kGenres(), {});
        for (const key of payload.genres) g[key] = (g[key] ?? 0) + 1;
        try {
          localStorage.setItem(kGenres(), JSON.stringify(g));
        } catch {}
      }
      if (firstTime && payload?.movie) {
        const st = readJson<{ movies?: number; ratingsSum?: number }>(kExtra(), {});
        st.movies = (st.movies ?? 0) + 1;
        try {
          localStorage.setItem(kExtra(), JSON.stringify(st));
        } catch {}
      }
      break;
    }
    case 'like':
      c.likes += 1;
      writeCounters(c);
      break;
    case 'review':
      c.reviews += 1;
      writeCounters(c);
      break;
    case 'comment':
      c.comments += 1;
      writeCounters(c);
      break;
    case 'theme':
      c.themeChanges += 1;
      writeCounters(c);
      break;
    case 'speed2':
      c.speed2 += 1;
      writeCounters(c);
      break;
    case 'voice':
      c.voices += 1;
      writeCounters(c);
      break;
    case 'section': {
      const sec = payload?.section;
      if (sec && !c.sections.includes(sec)) {
        c.sections = [...c.sections, sec];
        writeCounters(c);
      }
      break;
    }
    case 'rating': {
      c.ratings += 1;
      writeCounters(c);
      const ex = readJson<{ ratingsSum?: number }>(kExtra(), {});
      ex.ratingsSum = (ex.ratingsSum ?? 0) + (payload?.rating ?? 0);
      try { localStorage.setItem(kExtra(), JSON.stringify(ex)); } catch {}
      break;
    }
    case 'bookmarks':
    case 'lists':
      break; // значения берутся из library.state при проверке
  }
  if (type === 'streak') streak = payload?.streak ?? streak;
  checkAchievements(type === 'streak' ? streak : readStreakSafe());
}

function readStreakSafe(): number {
  try {
    return (JSON.parse(localStorage.getItem('anistream:streak') ?? 'null') as { current?: number } | null)?.current ?? 0;
  } catch {
    return 0;
  }
}
