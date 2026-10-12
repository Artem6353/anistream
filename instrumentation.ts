import { primeCatalogFromDb } from '@/lib/catalog';

/**
 * Next.js instrumentation: выполняется один раз при старте серверного процесса.
 *
 * Аудит 2026-10 (ТЗ 2.1): каталог подтягивается из Supabase (public.titles) до первого
 * запроса, чтобы страницы не ждали выборку из 8000 строк на рендере. Пока прайм не
 * завершился или если БД не настроена/недоступна, lib/catalog.ts работает из
 * lib/data/titles.json — деградации нет.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const count = await primeCatalogFromDb().catch(() => 0);
  if (count) console.log(`[catalog] загружено из Supabase: ${count} тайтлов`);
}
