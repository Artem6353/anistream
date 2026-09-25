/** Доменная модель каталога AniNova. */

export type TitleType = 'tv' | 'movie' | 'ona' | 'ova' | 'special';
export type TitleStatus = 'ongoing' | 'finished' | 'upcoming';
export type Season = 'winter' | 'spring' | 'summer' | 'fall';

export interface Title {
  anilistId: number;
  slug: string;
  /** Русское название (редакция каталога). */
  ru: string;
  romaji: string;
  en?: string | null;
  type: TitleType;
  year: number;
  season?: Season | null;
  status: TitleStatus;
  episodes: number;
  /** Рейтинг 0–10. */
  score: number;
  favourites: number;
  /** Слаги жанров (см. lib/labels.ts). */
  genres: string[];
  poster: string;
  banner?: string | null;
  description: string;
  /** YouTube-id трейлера (AniList trailer). */
  trailer?: string | null;
  studios?: string[];
  /** Первоисточник (AniList source). */
  source?: string | null;
  /** Длительность серии, мин. */
  duration?: number | null;
  isAdult?: boolean;
  /** Связи франшизы (AniList relations). */
  relations?: { id: number; type: string }[];
  /** Персонажи (AniList): имя, фото, роль. */
  characters?: { name: string; img: string | null; role: string }[];
  /** Кадры (Shikimori screenshots). */
  screenshots?: string[];
  /** Точные даты выхода серий завершённых тайтлов: { "<ep>": ms }. */
  epdates?: Record<string, number> | Record<number, number>;
  /** 'startDate' — дата проставлена из премьеры (фильмы/OVA без ТВ-расписания); иначе airingSchedule AniList */
  epdatesSource?: 'startDate';
  /** График выхода серий для онгоингов (AniList airingSchedule). */
  airing?: { ep: number; at: number }[];
  /** Скрыт модерацией (DMCA). */
  hidden?: boolean;
  /** MAL-id для AniSkip (тайминги OP/ED). */
  malId?: number | null;
  /** Второй источник метаданных: Shikimori (.io). */
  shikimori?: { id: number; ru: string | null; description: string | null; score: number } | null;
}

export type SortKey = 'pop' | 'score' | 'new' | 'az';

export interface CatalogQuery {
  q?: string;
  genres?: string[];
  type?: TitleType | '';
  status?: TitleStatus | '';
  year?: string;
  yearFrom?: string;
  yearTo?: string;
  length?: '' | 'short' | 'medium' | 'long' | 'xlong';
  view?: 'grid' | 'list';
  sort?: SortKey;
  page?: number;
}

export type ListStatus = 'watching' | 'completed' | 'onhold' | 'dropped' | 'planned' | 'rewatching';

export interface CatalogResult {
  items: Title[];
  total: number;
  page: number;
  pages: number;
}

export interface ScheduleEntry {
  /** unix ms */
  at: number;
  episode: number;
  anilistId: number;
  slug?: string;
  ru?: string;
  romaji: string;
  poster: string;
  source: 'live' | 'demo';
}

export interface HistoryEntry {
  slug: string;
  episode: number;
  position: number;
  duration: number;
  updatedAt: number;
}

export interface Settings {
  displayName?: string;
  autoplayNext: boolean;
  accent: string;
  reduceMotion: boolean;
  tvMode: boolean;
  defaultProvider: string;
}
