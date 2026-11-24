import type { CardTitle, Title } from '@/lib/types';

/** B2-D: в публичной выдаче preview допустим только русский заголовок.
 *  Если у тайтла его нет, показываем нейтральную подпись, а не romaji/
 *  titleOriginal: оригинальные названия остаются внутри поиска и данных. */
export const PUBLIC_TITLE_FALLBACK = 'Название недоступно';
const CYRILLIC = /[А-Яа-яЁё]/;

export function previewPublicTitle(value: string | null | undefined): string {
  const title = (value ?? '').trim();
  return title && CYRILLIC.test(title) ? title : PUBLIC_TITLE_FALLBACK;
}

export function previewCardTitle(title: CardTitle): CardTitle {
  return { ...title, ru: previewPublicTitle(title.ru) };
}

export function previewTitle(title: Title): Title {
  return { ...title, ru: previewPublicTitle(title.ru) };
}
