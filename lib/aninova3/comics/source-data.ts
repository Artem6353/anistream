/**
 * РУЧНАЯ РЕДАКЦИОННАЯ ПРОВЕРКА ОРИГИНАЛЬНЫХ КОМИКСОВ (B1-C).
 *
 * Здесь лежит только то, что нельзя вывести из relation-графа: русское название,
 * проверенный автор, русское описание, состояние публикационных проверок и
 * реально доступные русские главы.
 *
 * Правила, которые нельзя нарушать при правках этого файла:
 * 1. `russianTitleVerified: true` ставится только после ручной сверки с русским
 *    изданием/официальным источником, а не «потому что название похоже».
 * 2. `rightsVerified: true` — только при подтверждённом разрешении на публикацию;
 *    наличие перевода/сканов разрешением не является.
 * 3. `chapters` — только реально доступные русские главы с посчитанными
 *    страницами. Пустой массив = читать нечего, CTA «Читать мангу» не появляется.
 * 4. Никаких внутренних документов, договоров и лицензий в публичные поля.
 *
 * Комментарий к Naruto: связь с аниме подтверждена relation-ребром AniList
 * (Media 20 → ADAPTATION → Media 30011). Русское название «Наруто» совпадает с
 * проверенным русским названием аниме в каталоге, автор и метаданные сверены
 * редакционно. Прав на публикацию и подтверждённых русских глав нет, поэтому
 * произведение остаётся PENDING_VERIFICATION: карточка честно показывает
 * «первоисточник установлен, публикация недоступна» и НЕ даёт кнопку чтения.
 */
import type {
  ComicChapter,
  ComicKind,
  ComicPublishingStatus,
  PublicationStatus,
} from './model';

export interface EditorialComic {
  /** AniList id произведения (первичный ключ связи). */
  anilist: number;
  titleRu: string;
  russianTitleVerified: boolean;
  /** Проверенное русское написание авторов; латиница из AniList сюда не копируется. */
  authorsRu?: string[];
  authorsVerified?: boolean;
  /** Проверены ли год/статус/автор/обложка как публичные метаданные. */
  metadataVerified: boolean;
  descriptionRu?: string;
  publicationStatus: PublicationStatus;
  rightsVerified: boolean;
  verifiedAt?: string;
  /** Реально доступные русские главы. Пусто — читать нечего. */
  chapters?: ComicChapter[];
  /** Редакционные уточнения поверх relation-графа. */
  kind?: ComicKind;
  status?: ComicPublishingStatus;
  year?: number | null;
  cover?: string | null;
  /** Внутренняя заметка для отчёта (не выводится публично). */
  note?: string;
  /** Демо-произведение B1-B: не реальный первоисточник, в каталог не попадает. */
  isDemo?: boolean;
}

export const EDITORIAL_COMICS: EditorialComic[] = [
  {
    anilist: 30011,
    titleRu: 'Наруто',
    russianTitleVerified: true,
    authorsRu: ['Масаси Кисимото'],
    authorsVerified: true,
    metadataVerified: true,
    descriptionRu:
      'Манга Масаси Кисимото, выходившая в 1999–2014 годах и ставшая первоисточником аниме «Наруто». Известное число глав — 700, томов — 72.',
    publicationStatus: 'PENDING_VERIFICATION',
    rightsVerified: false,
    verifiedAt: '2026-11-20',
    chapters: [],
    kind: 'manga',
    status: 'completed',
    year: 1999,
    note: 'Прав на публикацию и подтверждённых русских глав нет — читалка закрыта.',
  },
];

const BY_ANILIST = new Map<number, EditorialComic>(EDITORIAL_COMICS.map((c) => [c.anilist, c]));

export function findEditorialComic(anilistId: number): EditorialComic | undefined {
  return BY_ANILIST.get(anilistId);
}
