/**
 * B1-C: типизированная модель связи «аниме ↔ комикс».
 *
 * Модель НЕ является production-схемой БД. Это контракт preview-слоя: его можно
 * один-в-один перенести в будущие таблицы `comic_*`, но в B1-C никаких миграций,
 * записей в Supabase/Redis и изменений API нет (см. docs/ANINOVA_3_B1C_RELATION_MODEL.md).
 */
import type { Title } from '@/lib/types';

/** Вид оригинального комикса. */
export type ComicKind = 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'comic';

export type ComicPublishingStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown';

/**
 * Состояние редакционной/publication-проверки произведения.
 * PENDING_VERIFICATION ≠ APPROVED: карточка может быть видна как «первоисточник
 * установлен», но читалка и CTA остаются закрыты.
 */
export type PublicationStatus = 'DRAFT' | 'PENDING_VERIFICATION' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

/**
 * Роль связанного произведения относительно текущего.
 * SOURCE — первоисточник (манга, по которой снято аниме); ADAPTATION — обратная связь.
 */
export type WorkRelationKind = 'SOURCE' | 'ADAPTATION' | 'SEQUEL' | 'PREQUEL' | 'SPIN_OFF' | 'ALTERNATIVE' | 'RELATED';

/** Только русский язык считается публично читаемым. Остальные значения — не fallback. */
export type ChapterLanguage = 'ru' | 'en' | 'ja' | 'ko' | 'zh' | 'other';

export interface ComicChapter {
  /** Устойчивый id главы внутри произведения. */
  id: string;
  number: number;
  titleRu: string;
  /** Публичная читалка допускает только 'ru'; другие языки не подменяют русский. */
  language: ChapterLanguage;
  /** Реально доступные страницы. 0 — глава не считается доступной. */
  pages: number;
  /**
   * URL страниц для читалки. Публичная читалка открывает главу только при наличии
   * реальных страниц: «права подтверждены» и «есть что показать» — разные проверки.
   * Пусто/отсутствует → кнопка чтения не появляется.
   */
  pageImages?: string[];
  publishedAt?: string;
}

export interface ComicPublication {
  status: PublicationStatus;
  russianTitleVerified: boolean;
  russianMetadataVerified: boolean;
  rightsVerified: boolean;
  /** Чем подтверждено состояние: relation-граф, ручная проверка или тестовый fixture. */
  verificationBasis?: 'anilist-relation' | 'editorial' | 'fixture';
  /** ISO-дата последней проверки (только для аудита, без внутренних документов). */
  verifiedAt?: string;
}

/** Уровень проверки произведения. Отделён от публикационного статуса. */
export type ComicVerification = 'UNVERIFIED' | 'CANDIDATE' | 'EDITORIALLY_VERIFIED';

/** Нейтральный текст вместо непроверенного русского названия (см. §9.2 ТЗ B1-C). */
export const PENDING_TITLE_TEXT = 'Информация о русскоязычном издании уточняется';

/** Кандидат русского названия, найденный автоматически. Публично не выводится. */
export interface ComicTitleCandidate {
  title: string;
  source: 'shikimori';
  url: string | null;
  fetchedAt: string;
}

export interface ComicExternalIds {
  anilist?: number;
  mal?: number;
  shikimori?: number;
  /** Внутренний стабильный id: `comic:anilist:<id>` (не зависит от маршрута и slug). */
  internal: string;
}

/** Откуда взялась запись произведения: relation-граф AniList или ручная редакция. */
export type ComicProvenance =
  | { source: 'anilist-relation'; observedAt?: string; verification: 'recorded' | 'verified' }
  | { source: 'editorial'; observedAt?: string; verification: 'editorial' }
  | { source: 'fixture'; observedAt?: string; verification: 'fixture' };

export interface ComicWork {
  /** Стабильный внутренний id; одинаков независимо от страницы открытия. */
  id: string;
  slug: string;
  /** Публичное название. Русское — только если проверено (см. publication). */
  titleRu: string;
  /** Оригинальное название (romaji/native) — не подменяет русское. */
  titleOriginal: string;
  kind: ComicKind;
  authors: string[];
  /** Автор показывается только при подтверждении; иначе поле остаётся в данных. */
  authorsVerified: boolean;
  year: number | null;
  status: ComicPublishingStatus;
  cover?: string | null;
  descriptionRu?: string | null;
  /** Все известные главы; публичная читалка фильтрует по language === 'ru' и pages > 0. */
  chapters: ComicChapter[];
  /** Сколько глав заявлено в источнике — справочно, не «доступно». */
  totalChaptersKnown?: number | null;
  externalIds: ComicExternalIds;
  publication: ComicPublication;
  /** Уровень проверки: непроверено / автоматический кандидат / редакционная сверка. */
  verification: ComicVerification;
  /** Внутренний кандидат русского названия — только для ревью, не для UI. */
  titleRuCandidate?: ComicTitleCandidate | null;
  provenance: ComicProvenance;
  /** Демо B1-B не является реальным произведением и не может быть первоисточником. */
  isDemo?: boolean;
}

/** Сырой тип связи из AniList relation-графа (для аудита, не для UI). */
export type RawRelationType =
  | 'ADAPTATION'
  | 'PARENT'
  | 'SEQUEL'
  | 'PREQUEL'
  | 'SIDE_STORY'
  | 'SPIN_OFF'
  | 'ALTERNATIVE'
  | 'OTHER'
  | 'SUMMARY'
  | 'CHARACTER'
  | 'COMPILATION'
  | 'FULL_STORY'
  | 'UNKNOWN';

/** Подтверждённая связь «аниме ← комикс». Направление всегда «от аниме к комиксу». */
export interface ComicSourceEvidence {
  animeAniListId: number;
  animeMalId?: number;
  comicAniListId?: number;
  comicMalId?: number;
  comicInternalId?: string;
  /** Роль комикса относительно аниме. Для первоисточника — SOURCE. */
  role: WorkRelationKind;
  evidence: 'anilist-relation' | 'manual' | 'fixture';
  /** Сырой relationType AniList (ADAPTATION/…), пусто для ручной связи. */
  rawRelation?: RawRelationType;
  /** Для аудита: откуда именно взялась связь. */
  note?: string;
  observedAt?: string;
}

/**
 * Направление связи «аниме ↔ комикс», которого AniList сам не различает.
 *
 * `ADAPTATION` в обе стороны означает только «эти два произведения связаны
 * экранизацией»; кто из них первоисточник, решает дата начала:
 *  - комикс вышел до (или одновременно с) аниме → первоисточник аниме;
 *  - комикс вышел существенно позже → это комикс по аниме (манга-адаптация).
 * B1-D: на реальных данных это 85 рёбер, которые B1-C показывал как «первоисточник».
 */
export type ComicDirection = 'comic-is-source' | 'comic-adapts-anime' | null;

/** Допуск в годах: манга может стартовать в год выхода аниме или на следующий. */
export const SOURCE_YEAR_TOLERANCE = 1;

/** Комикс вышел настолько позже аниме, что первоисточником быть не может. */
export function comicAdaptsAnime(comicYear: number | null | undefined, animeYear: number | null | undefined): boolean {
  if (!comicYear || !animeYear) return false;
  return comicYear > animeYear + SOURCE_YEAR_TOLERANCE;
}

export interface LinkedComic {
  comic: ComicWork;
  role: WorkRelationKind;
  /** Основной первоисточник: визуально выделяется. */
  primary: boolean;
  evidence: ComicSourceEvidence['evidence'];
  /** Кто здесь оригинал: подтверждено датами, а не порядком в ответе API. */
  direction: ComicDirection;
}

export interface LinkedAnime {
  anime: Title;
  role: WorkRelationKind;
  primary: boolean;
  evidence: ComicSourceEvidence['evidence'];
  direction: ComicDirection;
}

/** Подпись роли комикса на странице аниме. */
export function animeSideRoleLabel(link: Pick<LinkedComic, 'role' | 'primary' | 'direction'>): string {
  if (link.primary && link.role === 'SOURCE') return 'Основной первоисточник';
  if (link.role === 'SOURCE') return 'Также первоисточник';
  if (link.direction === 'comic-adapts-anime') return 'Комикс по аниме';
  return RELATION_LABELS[link.role];
}

/** Подпись роли аниме на странице комикса. */
export function comicSideRoleLabel(link: Pick<LinkedAnime, 'role' | 'direction'>): string {
  if (link.direction === 'comic-adapts-anime') return 'Оригинальный сериал';
  return RELATION_LABELS[link.role];
}

/** Причина, по которой объект нельзя показать как читаемый (внутренние документы прав сюда не попадают). */
export type PublicationIssue =
  | 'draft'
  | 'pending_verification'
  | 'rejected'
  | 'expired'
  | 'title_unverified'
  | 'metadata_unverified'
  | 'rights_unverified'
  | 'no_ru_chapters'
  | 'demo';

export const RELATION_LABELS: Record<WorkRelationKind, string> = {
  SOURCE: 'Первоисточник',
  ADAPTATION: 'Аниме-адаптация',
  SEQUEL: 'Продолжение',
  PREQUEL: 'Предыстория',
  SPIN_OFF: 'Ответвление',
  ALTERNATIVE: 'Альтернативная версия',
  RELATED: 'Связанное произведение',
};

export const COMIC_STATUS_LABELS: Record<ComicPublishingStatus, string> = {
  ongoing: 'Выходит',
  completed: 'Завершён',
  hiatus: 'Приостановлен',
  cancelled: 'Отменён',
  unknown: 'Статус уточняется',
};

export const COMIC_KIND_LABELS: Record<ComicKind, string> = {
  manga: 'Манга',
  manhwa: 'Манхва',
  manhua: 'Маньхуа',
  webtoon: 'Вебтун',
  comic: 'Комикс',
};

/** Сила связи при дедупликации одного и того же комикса из нескольких рёбер. */
export const RELATION_PRIORITY: Record<WorkRelationKind, number> = {
  SOURCE: 7,
  ADAPTATION: 6,
  PREQUEL: 5,
  SEQUEL: 4,
  SPIN_OFF: 3,
  ALTERNATIVE: 2,
  RELATED: 1,
};

/**
 * Обратная роль для навигации «комикс → аниме».
 * - SOURCE (манга — первоисточник аниме) → ADAPTATION;
 * - SEQUEL/PREQUEL меняются местами;
 * - SPIN_OFF/ALTERNATIVE/RELATED симметричны.
 */
export function invertRelation(kind: WorkRelationKind): WorkRelationKind {
  switch (kind) {
    case 'SOURCE':
      return 'ADAPTATION';
    case 'ADAPTATION':
      return 'SOURCE';
    case 'SEQUEL':
      return 'PREQUEL';
    case 'PREQUEL':
      return 'SEQUEL';
    default:
      return kind;
  }
}
