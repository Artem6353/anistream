import { safeNextPath } from '@/lib/supabase/middleware';

/** B2-C: маршруты входа и кабинета внутри preview. */
export const PREVIEW_ROOT = '/preview/aninova-3';
export const PREVIEW_AUTH_PATH = `${PREVIEW_ROOT}/auth`;
export const PREVIEW_PROFILE_PATH = `${PREVIEW_ROOT}/profile`;

/** Production-разделы, у которых уже есть preview-аналог. */
const MAPPED_ROOTS = ['/catalog', '/schedule', '/anime', '/profile', '/search', '/settings', '/comics'];

/**
 * Куда вернуть пользователя после входа в preview.
 *
 * `next` приходит из query и уже прошёл `safeNextPath` (только локальный путь).
 * Наружу не выпускаем: неизвестный или небезопасный адрес ведёт в preview-кабинет.
 * Production-адрес переписываем в preview-аналог, чтобы после формы не выбросить
 * человека обратно в старый интерфейс.
 */
export function previewAuthNext(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  if (safe === '/profile' || safe === '/auth') return PREVIEW_PROFILE_PATH;

  if (safe === PREVIEW_ROOT || safe.startsWith(`${PREVIEW_ROOT}/`)) {
    if (safe === PREVIEW_AUTH_PATH || safe.startsWith(`${PREVIEW_AUTH_PATH}?`)) return PREVIEW_PROFILE_PATH;
    return safe;
  }

  if (safe === '/') return PREVIEW_ROOT;

  for (const root of MAPPED_ROOTS) {
    if (safe === root || safe.startsWith(`${root}/`) || safe.startsWith(`${root}?`)) {
      return `${PREVIEW_ROOT}${safe}`;
    }
  }

  return PREVIEW_PROFILE_PATH;
}
