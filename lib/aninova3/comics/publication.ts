import type { ComicChapter, ComicWork, PublicationIssue } from './model';

/**
 * Публичные правила B1-C.
 *
 * 1. В читалке видны только APPROVED + проверенное русское название и метаданные +
 *    подтверждённые права + реальные русские главы.
 * 2. Язык главы не наследуется и не подменяется: en/ja/ko/zh никогда не fallback.
 * 3. Права проверяются отдельно от перевода: наличие русского текста не означает
 *    разрешение на публикацию.
 * 4. Демо B1-B никогда не считается публично читаемым реальным произведением.
 * 5. Отсутствующие главы не генерируются: chapters = [] значит «читать нечего».
 */
export function isPublicRuChapter(chapter: ComicChapter): boolean {
  return chapter.language === 'ru' && Number.isFinite(chapter.number) && chapter.number > 0 && chapter.pages > 0;
}

export function publicRuChapters(comic: ComicWork): ComicChapter[] {
  return comic.chapters.filter(isPublicRuChapter).sort((a, b) => a.number - b.number);
}

export function publicationIssues(comic: ComicWork): PublicationIssue[] {
  const issues: PublicationIssue[] = [];
  if (comic.isDemo) issues.push('demo');
  if (comic.publication.status === 'DRAFT') issues.push('draft');
  if (comic.publication.status === 'PENDING_VERIFICATION') issues.push('pending_verification');
  if (comic.publication.status === 'REJECTED') issues.push('rejected');
  if (comic.publication.status === 'EXPIRED') issues.push('expired');
  if (!comic.publication.russianTitleVerified) issues.push('title_unverified');
  if (!comic.publication.russianMetadataVerified) issues.push('metadata_unverified');
  if (!comic.publication.rightsVerified) issues.push('rights_unverified');
  if (!publicRuChapters(comic).length) issues.push('no_ru_chapters');
  return [...new Set(issues)];
}

/** Публичная читалка: все проверки обязательны. */
export function isPubliclyReadable(comic: ComicWork): boolean {
  return (
    !comic.isDemo &&
    comic.publication.status === 'APPROVED' &&
    comic.publication.russianTitleVerified &&
    comic.publication.russianMetadataVerified &&
    comic.publication.rightsVerified &&
    publicRuChapters(comic).length > 0
  );
}

/**
 * Техническая готовность читалки: есть хотя бы одна русская глава с реальными
 * страницами. Отдельно от публикационных прав — чтобы на странице не появлялась
 * ссылка в 404 и не обещалось чтение того, что показать нельзя.
 */
export function hasReaderSource(comic: ComicWork): boolean {
  return publicRuChapters(comic).some((ch) => (ch.pageImages?.length ?? 0) > 0);
}

/** Кнопка «Читать мангу»: и права, и главы с реальными страницами. */
export function canOpenReader(comic: ComicWork): boolean {
  return isPubliclyReadable(comic) && hasReaderSource(comic);
}

/** Есть ли смысл показывать ссылку на страницу произведения (оно не запрещено к показу). */
export function isPublishableEntry(comic: ComicWork): boolean {
  return comic.publication.status !== 'REJECTED' && comic.publication.status !== 'EXPIRED';
}

/**
 * Публичное название. Русское показывается только когда оно проверено;
 * иначе честно выводится оригинальное, без подмены языка.
 */
export function comicDisplayTitle(comic: ComicWork): { text: string; russian: boolean } {
  if (comic.publication.russianTitleVerified && comic.titleRu) return { text: comic.titleRu, russian: true };
  return { text: comic.titleOriginal || comic.titleRu, russian: false };
}

/** Публичная читалка B1-B для демо остаётся, но не выдаётся за реальные права/главы. */
export function isPreviewReadable(comic: ComicWork): boolean {
  return comic.isDemo || isPubliclyReadable(comic);
}

export const PUBLICATION_ISSUE_LABELS: Record<PublicationIssue, string> = {
  draft: 'черновик',
  pending_verification: 'ожидает проверки',
  rejected: 'публикация запрещена',
  expired: 'разрешение истекло',
  title_unverified: 'русское название не проверено',
  metadata_unverified: 'русские метаданные не проверены',
  rights_unverified: 'права не подтверждены',
  no_ru_chapters: 'нет доступных русских глав',
  demo: 'демонстрационные данные',
};

/** Публичная формулировка причин (без внутренних документов и названий договоров). */
export function publicationSummary(comic: ComicWork): string {
  const issues = publicationIssues(comic);
  if (!issues.length) return 'Публикация разрешена';
  return issues.map((issue) => PUBLICATION_ISSUE_LABELS[issue]).join(' · ');
}

/** Короткая строка про главы для карточки. Никогда не обещает больше, чем есть. */
export function chaptersLine(comic: ComicWork): string {
  const ru = publicRuChapters(comic);
  if (ru.length) {
    return `${ru.length} ${ru.length === 1 ? 'глава' : 'глав'} на русском`;
  }
  if (comic.totalChaptersKnown) {
    return `Русских глав нет · известно ${comic.totalChaptersKnown} глав`;
  }
  return 'Русских глав нет';
}
