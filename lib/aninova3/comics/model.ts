/**
 * B1-C: типизированная модель связи «аниме ↔ комикс».
 *
 * Модель НЕ является production-схемой БД. Это контракт preview-слоя: его можно
 * один-в-один перенести в будущие таблицы `comic_*`, но в B1-C никаких миграций,
 * записей в Supabase/Redis и изменений API нет (см. docs/ANINOVA_3_B1C_RELATION_MODEL.md).
 */
import type { Title } from '@/lib/types';

/**
 * Вид оригинального комикса.
 *
 * B3-E: набор приведён к B3-схеме (`comic_works_kind_check`). `unknown` —
 * легальное состояние, когда источник не даёт достаточного доказательства типа:
 * AniList сообщает только `MANGA` для японской манги, корейской манхвы и
 * китайской маньхуа, поэтому формат/страна сами по себе тип не подтверждают.
 */
export type ComicKind = 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'comic' | 'one_shot' | 'unknown';

/**
 * Доказательство типа произведения.
 *
 * `sourceFormat` — сырой формат источника (AniList MANGA/ONE_SHOT), `sourceKind` —
 * нормализованный тип источника, если он прямо назван (например `MANHWA`).
 * `countryCode` сохраняется как справка, но НЕ участвует в выводе типа.
 */
export interface ComicKindEvidence {
  sourceFormat: string | null;
  sourceKind: string | null;
  countryCode: string | null;
  basis: 'source-format' | 'source-kind' | 'editorial' | 'unknown';
}

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
  /**
   * B1-E: поля для будущего подключения глав. Сейчас ни одна глава не подключена,
   * но контракт зафиксирован, чтобы читалка не появилась без прав.
   */
  /** Источник главы: только разрешённый источник, не «найдено в сети». */
  source?: ChapterSource;
  /** Дата проверки прав именно на эту главу (или на произведение, если указано). */
  rightsVerifiedAt?: string | null;
  /** Скрытая глава не попадает в публичную читалку даже при наличии страниц. */
  availability?: 'public' | 'hidden';
  /** Когда глава последний раз менялась — для журнала изменений. */
  updatedAt?: string | null;
  /**
   * B3-E: официальная ссылка на главу из public.comic_public_chapters.
   * Это НЕ страницы читалки: внутренняя читалка по-прежнему требует pageImages.
   */
  readingUrl?: string | null;
  /** Название источника главы (издатель/партнёр) — для подписи ссылки. */
  sourceName?: string | null;
}

/** Разрешённые источники глав: пиратские сайты сюда не входят по определению. */
export type ChapterSource = 'licensed-publisher' | 'authorized-partner' | 'editorial-demo';

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

/**
 * Статус русскоязычных метаданных произведения. Отделён от публикационного статуса.
 *
 * `SOURCE_VERIFIED` — русское название сверено с источником по совпавшим
 * идентификаторам (AniList → MAL → Shikimori). Это НЕ редакционное подтверждение
 * и НЕ официальное название лицензии, и тем более не права на публикацию.
 */
export type ComicVerification =
  | 'UNVERIFIED'
  | 'CANDIDATE'
  | 'SOURCE_VERIFIED'
  | 'EDITORIALLY_VERIFIED'
  | 'NAME_MISMATCH'
  | 'NO_RU_TITLE'
  | 'NOT_FOUND'
  | 'PENDING_REVIEW';

/** Статусы, при которых русское название можно показывать публично. */
export const PUBLIC_TITLE_STATUSES: readonly ComicVerification[] = ['SOURCE_VERIFIED', 'EDITORIALLY_VERIFIED'];

export function hasPublicRussianTitle(status: ComicVerification): boolean {
  return PUBLIC_TITLE_STATUSES.includes(status);
}

/**
 * Происхождение русскоязычных метаданных.
 *
 * `officialPublisherConfirmed` всегда false, пока название не сверено с сайтом
 * правообладателя/издателя: поле Shikimori `license_name_ru` — заявка третьей
 * стороны, а не подтверждение лицензии.
 */
export interface ComicMetadataEvidence {
  status: ComicVerification;
  source: string;
  sourceUrl: string | null;
  checkedAt: string | null;
  licenseNameRu?: string | null;
  licenseClaimSource?: string | null;
  officialPublisherConfirmed: boolean;
  defects?: string[];
}

/** Нейтральный текст вместо непроверенного русского названия (см. §9.2 ТЗ B1-C). */
export const PENDING_TITLE_TEXT = 'Информация о русскоязычном издании уточняется';

/** Источник данных для публичного comics-слоя. */
export type ComicDataSource = 'json-preview' | 'db-public';

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
  /** Уровень проверки русскоязычных метаданных (см. ComicVerification). */
  verification: ComicVerification;
  /** Происхождение русских метаданных: источник, ссылка, дата проверки. */
  metadata: ComicMetadataEvidence | null;
  /** Русские жанры из источника — только если метаданные проверены. */
  genres: string[];
  /** Роли этого произведения во всех рёбрах графа. */
  roles: WorkRelationKind[];
  /** AniList id аниме, для которых это произведение — ребро ADAPTATION. */
  animeIds: number[];
  /** Внутренний кандидат русского названия — только для ревью, не для UI. */
  titleRuCandidate?: ComicTitleCandidate | null;
  provenance: ComicProvenance;
  /** Демо B1-B не является реальным произведением и не может быть первоисточником. */
  isDemo?: boolean;
  /** Источник данных: curated JSON preview или DB public view. */
  dataSource: ComicDataSource;
  /** На чём основан `kind`: источник назвал тип, редакция или тип неизвестен. */
  kindEvidence?: ComicKindEvidence;
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
 * экранизацией». Направление — отдельное утверждение, и оно бывает трёх уровней:
 * подтверждённое, предположительное и неизвестное (см. `classifyAdaptationDirection`).
 */
export type ComicDirection = 'comic-is-source' | 'comic-adapts-anime' | null;

/**
 * Насколько можно доверять направлению связи.
 * - `confirmed` — есть прямое основание: каталог сообщает первоисточник аниме
 *   (`MANGA` для комиксов, `ORIGINAL` для оригинального аниме);
 * - `inferred` — направление следует из неполного, но прямого основания:
 *   каталог говорит «аниме по манге», однако год комикса не подтверждён;
 * - `unknown` — данных недостаточно, направление не утверждается.
 */
export type DirectionConfidence = 'confirmed' | 'inferred' | 'unknown';

/**
 * На чём основано направление (для отчёта и очереди проверки).
 *
 * B3-E: ветка `dates` удалена. Порядок годов больше не назначает направление:
 * он сохраняется как `dates-insufficient` и означает «годы известны, но это не
 * доказательство». Любое неподтверждённое направление остаётся `unknown`.
 */
export type DirectionBasis =
  | 'catalog-manga'
  | 'catalog-original'
  | 'catalog-conflict'
  | 'catalog-other-medium'
  | 'dates-insufficient'
  | 'none';

export interface DirectionEvidence {
  direction: ComicDirection;
  confidence: DirectionConfidence;
  basis: DirectionBasis;
}

/**
 * Конкурирующее доказательство направления.
 *
 * B3-E: конфликтующие наблюдения не отбрасываются молча. Каждое ребро, которое
 * не победило при дедупликации, сохраняется здесь и уходит в review.
 */
export interface DirectionConflict {
  basis: DirectionBasis;
  direction: ComicDirection;
  confidence: DirectionConfidence;
  rawRelation?: RawRelationType;
  evidence: ComicSourceEvidence['evidence'];
  observedAt?: string;
  note?: string;
}

/** Допуск в годах: комикс может стартовать в год выхода аниме или на следующий. */
export const SOURCE_YEAR_TOLERANCE = 1;

/** Источники AniList, означающие «аниме снято по комиксу». */
const COMIC_MEDIA_SOURCES = new Set(['MANGA', 'COMIC', 'DOUJINSHI']);

/**
 * Направление связи для ребра экранизации.
 *
 * Годы выпуска НЕ являются доказательством направления (B3-E, требование A3):
 * последовательность дат не различает «манга → аниме» и «аниме → манга-адаптацию»
 * и не должна превращать догадку в факт. Годы используются только для поиска
 * противоречия, когда направление уже следует из каталога.
 *
 * Решает каталог (`anime.source`):
 *  - аниме по манге → первоисточник комикс (при согласии дат — подтверждено,
 *    без года комикса — `inferred`);
 *  - оригинальное аниме → подтверждено, что комикс сделан по аниме;
 *  - аниме по другому первоисточнику (ранобэ, игра) → направление не утверждаем;
 *  - аниме по манге, но комикс вышел заметно позже → противоречие, нужна проверка;
 *  - каталог не знает первоисточник → направление `unknown` при любых годах.
 */
export function classifyAdaptationDirection(input: {
  animeSource?: string | null;
  animeYear?: number | null;
  comicYear?: number | null;
  yearTolerance?: number;
}): DirectionEvidence {
  const tolerance = input.yearTolerance ?? SOURCE_YEAR_TOLERANCE;
  const source = (input.animeSource ?? '').trim().toUpperCase();
  const animeYear = input.animeYear ?? null;
  const comicYear = input.comicYear ?? null;
  const datesKnown = Boolean(animeYear && comicYear);
  const comicIsLater = datesKnown && (comicYear as number) > (animeYear as number) + tolerance;

  if (COMIC_MEDIA_SOURCES.has(source)) {
    if (comicIsLater) return { direction: null, confidence: 'unknown', basis: 'catalog-conflict' };
    return {
      direction: 'comic-is-source',
      confidence: datesKnown ? 'confirmed' : 'inferred',
      basis: 'catalog-manga',
    };
  }
  if (source === 'ORIGINAL') {
    return { direction: 'comic-adapts-anime', confidence: 'confirmed', basis: 'catalog-original' };
  }
  if (source) return { direction: null, confidence: 'unknown', basis: 'catalog-other-medium' };

  /* Каталог не сообщает первоисточник. Одни годы направление не доказывают. */
  return {
    direction: null,
    confidence: 'unknown',
    basis: datesKnown ? 'dates-insufficient' : 'none',
  };
}

/** Связь не про экранизацию: направление не определено и не нужно. */
export const NO_DIRECTION: DirectionEvidence = { direction: null, confidence: 'unknown', basis: 'none' };

/** Направление известно хотя бы предположительно — можно делать осторожное утверждение. */
export function hasDirectedEvidence(evidence: DirectionEvidence): boolean {
  return evidence.direction !== null && evidence.confidence !== 'unknown';
}

export interface LinkedComic {
  comic: ComicWork;
  role: WorkRelationKind;
  /** Основной первоисточник: визуально выделяется. */
  primary: boolean;
  evidence: ComicSourceEvidence['evidence'];
  /** Кто здесь оригинал. */
  direction: ComicDirection;
  /** Насколько направление подтверждено. */
  confidence: DirectionConfidence;
  basis: DirectionBasis;
  /** Все проигравшие при дедупликации доказательства: конфликт уходит в review. */
  conflicts?: DirectionConflict[];
  /** Есть конкурирующие доказательства направления. */
  disputed?: boolean;
}

export interface LinkedAnime {
  anime: Title;
  role: WorkRelationKind;
  primary: boolean;
  evidence: ComicSourceEvidence['evidence'];
  direction: ComicDirection;
  confidence: DirectionConfidence;
  basis: DirectionBasis;
  /** Все проигравшие при дедупликации доказательства: конфликт уходит в review. */
  conflicts?: DirectionConflict[];
  /** Есть конкурирующие доказательства направления. */
  disputed?: boolean;
}

/** Нейтральная подпись, когда направление не подтверждено. */
export const NEUTRAL_ROLE_LABEL = 'Связанное произведение';

/** Подпись роли комикса на странице аниме. */
export function animeSideRoleLabel(
  link: Pick<LinkedComic, 'role' | 'primary' | 'direction' | 'confidence'>,
): string {
  if (link.role === 'SOURCE') {
    if (link.confidence === 'confirmed') return link.primary ? 'Основной первоисточник' : 'Также первоисточник';
    if (link.confidence === 'inferred') return link.primary ? 'Вероятный первоисточник' : 'Возможно, первоисточник';
    /* Направление неизвестно: заявлять «первоисточник» нельзя. */
    return NEUTRAL_ROLE_LABEL;
  }
  if (link.direction === 'comic-adapts-anime') {
    return link.confidence === 'confirmed' ? 'Комикс по аниме' : 'Вероятно, комикс по аниме';
  }
  if (link.role === 'ADAPTATION') return NEUTRAL_ROLE_LABEL;
  return RELATION_LABELS[link.role];
}

/** Подпись роли аниме на странице комикса. */
export function comicSideRoleLabel(link: Pick<LinkedAnime, 'role' | 'direction' | 'confidence'>): string {
  if (link.direction === 'comic-adapts-anime') {
    return link.confidence === 'confirmed' ? 'Оригинальный сериал' : 'Вероятно, оригинальный сериал';
  }
  if (link.role === 'ADAPTATION') {
    if (link.confidence === 'confirmed') return 'Аниме-адаптация';
    return link.confidence === 'inferred' ? 'Вероятно, аниме-адаптация' : NEUTRAL_ROLE_LABEL;
  }
  if (link.role === 'SOURCE') return NEUTRAL_ROLE_LABEL;
  return RELATION_LABELS[link.role];
}

/** Состояние секции связей на странице аниме. */
export type SourceSectionState = 'confirmed' | 'probable' | 'unconfirmed' | 'related';

export function sourceSectionState(
  links: Pick<LinkedComic, 'role' | 'confidence'>[],
): SourceSectionState {
  const sources = links.filter((l) => l.role === 'SOURCE');
  if (sources.some((l) => l.confidence === 'confirmed')) return 'confirmed';
  if (sources.some((l) => l.confidence === 'inferred')) return 'probable';
  if (sources.length) return 'unconfirmed';
  return 'related';
}

/** Заголовок секции связей на странице аниме: не обещает больше, чем известно. */
export function sourceSectionTitle(state: SourceSectionState): string {
  if (state === 'confirmed') return 'Первоисточник';
  if (state === 'probable') return 'Вероятный первоисточник';
  return 'Связанные комиксы';
}

/**
 * Описание секции — по фактическому основанию (`basis`), а не по одному флагу.
 *
 * `catalog-manga` без года комикса даёт `inferred` вовсе не из-за сравнения дат:
 * это данные каталога, у которых нет года выпуска. Обещать «определено по датам»
 * в таком случае — значит объяснять пользователю неправду.
 */
export function sourceSectionDescription(
  links: Pick<LinkedComic, 'role' | 'confidence' | 'basis' | 'direction'>[],
): string {
  const state = sourceSectionState(links);
  const sources = links.filter((l) => l.role === 'SOURCE');
  const bases = new Set(sources.map((l) => l.basis));
  const multi = links.length > 1;

  if (state === 'confirmed') {
    if (multi) return 'Подтверждённые по идентификатору AniList оригинальные произведения этого аниме.';
    if (bases.has('catalog-original')) {
      return 'Это оригинальное аниме, поэтому комикс создан по нему: связь подтверждена по идентификатору AniList.';
    }
    return 'Оригинальное произведение, по которому снято аниме. Связь подтверждена по идентификатору AniList, а не по совпадению названия.';
  }

  if (state === 'probable') {
    const onlyCatalog = bases.size === 1 && bases.has('catalog-manga');
    if (onlyCatalog) {
      return 'Связь подтверждена по идентификатору AniList. Каталог сообщает, что аниме снято по манге, но год выпуска комикса не подтверждён — направление требует проверки.';
    }
    return 'Связь подтверждена по идентификатору AniList. Направление определено косвенно и требует проверки.';
  }

  if (state === 'unconfirmed') {
    if (bases.has('dates-insufficient')) {
      return 'Связь подтверждена по идентификатору AniList, но направление по годам выпуска не определяется: нужен официальный источник или подтверждённый первоисточник.';
    }
    if (bases.has('catalog-conflict')) {
      return 'Связи подтверждены по идентификатору AniList, но данные каталога и годы выпуска противоречат друг другу — направление требует проверки.';
    }
    if (bases.has('catalog-other-medium')) {
      return 'Аниме снято по другому первоисточнику, поэтому роль этого комикса не установлена: произведения показаны как связанные.';
    }
    return 'Связи подтверждены по идентификатору AniList; данных для определения направления недостаточно.';
  }

  /* Первоисточников нет, но все связи — комиксы по этому аниме. */
  const adaptsOnly = links.length > 0 && links.every((l) => (l as { direction?: ComicDirection }).direction === 'comic-adapts-anime');
  if (adaptsOnly) {
    const allConfirmed = links.every((l) => l.confidence === 'confirmed');
    return allConfirmed
      ? 'Оригинальное аниме: комиксы созданы по нему. Связь подтверждена по идентификатору AniList.'
      : 'Комиксы, вероятно созданные по этому аниме: связь подтверждена по идентификатору AniList, направление требует проверки.';
  }

  return 'Комиксы, подтверждённые по идентификатору AniList: первоисточник среди них не установлен.';
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
  one_shot: 'Ваншот',
  unknown: 'Тип уточняется',
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
