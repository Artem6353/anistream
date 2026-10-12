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
  /** Итоговое число серий. null — источник его не подтвердил (онгоинг/анонс).
      НИКОГДА не подставлять заглушку: см. lib/episodes.ts (аудит 2026-10, ТЗ 1.2). */
  episodes: number | null;
  /** Сколько серий уже вышло (для онгоингов — из airing/epdates). */
  episodesReleased?: number | null;
  /** Рейтинг 0–10. */
  score: number;
  /** Число оценок (не «избранных»!) — нужно для честного aggregateRating (ТЗ 3.2.1). */
  ratingCount?: number | null;
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
  /** Названия серий по номерам (scripts/sync-episodes.mjs → таблица `episodes`).
      Пусто → в UI показываем «Серия N», а не «Episode N» (ТЗ 1.3). */
  episodeNames?: Record<string, string>;
  /** Скрыт модерацией (DMCA). */
  hidden?: boolean;
  /** Источник метаданных (ТЗ Jikan, блок 5): anilist (дефолт) | jikan.
      Имя metaSource, т.к. source уже занят первоисточником (MANGA/LIGHT_NOVEL/…). */
  metaSource?: 'anilist' | 'jikan';
  /** MAL-id для AniSkip (тайминги OP/ED). */
  malId?: number | null;
  /** Второй источник метаданных: Shikimori (.io). */
  shikimori?: { id: number; ru: string | null; description: string | null; score: number } | null;
  /** Официальные сервисы просмотра (блок «Где смотреть легально», LEGAL_WATCH_ENABLED). */
  legalWatch?: { name: string; url: string; note?: string | null }[];
}

/** S2.2 (аудит 28.09): проекция тайтла для карточек PosterCard. Полный Title (~2.7 КБ JSON:
    описание, персонажи, связи, airing) уезжал в RSC-payload и клиентские пропсы — главная
    весила 1081 КБ. Карточке нужны только эти поля; /api/titles отдаёт совместимую форму. */
export type CardTitle = Pick<
  Title,
  'slug' | 'ru' | 'romaji' | 'type' | 'year' | 'status' | 'episodes' | 'episodesReleased' | 'score' | 'genres' | 'poster'
>;

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
  /** 'db' — таблица airing_schedule (воркер), 'catalog' — реальный график из каталога.
      Значения 'demo' больше нет: фейковая неделя удалена (ТЗ 1.1). */
  source: 'db' | 'catalog';
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
  /** Запомненная скорость воспроизведения (ТЗ 22). */
  playbackRate?: number;
  /** Автопропуск OP/ED (ТЗ 22), по умолчанию выключен. */
  skipIntro?: boolean;
  /** Марафон: автопереход без обратного отсчёта (ТЗ 22). */
  marathon?: boolean;
  accent: string;
  /** Кастомный акцент (hex) из пикера настроек (ТЗ блок 5); перекрывает пресет accent. */
  customAccent?: string | null;
  /** Тема оформления (ТЗ блок 13): dark | light | system (дефолт). */
  theme: 'dark' | 'light' | 'system';
  reduceMotion: boolean;
  tvMode: boolean;
  defaultProvider: string;
}
