/**
 * Старт процесса Next.js (feat/db-cache): прогреваем кэш резолвов в память.
 *
 * Зачем: кэш больше не лежит в git-файле, а живёт в Supabase (episode_sources +
 * episode_source_urls). Если грузить его лениво, первый резолв серии после холодного
 * старта ждёт десятки секунд и полной выборки таблицы. Здесь мы делаем это один раз
 * до приёма трафика, а сам путь остаётся безопасным: при любой ошибке кэш просто
 * останется пустым (резолвы пойдут в провайдеры через bridge).
 *
 * Не запускаем на этапе сборки (статические страницы не должны ждать загрузки БД)
 * и не трогаем edge-рантайм (там нет ни node:fs, ни смысла держать 300k строк).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if ((process.env.PROVIDER_CACHE_PRELOAD ?? '1') === '0') return;

  try {
    const { preloadProviderCache } = await import('@/lib/providers/cache');
    const startedAt = Date.now();
    const { entries, backend } = await preloadProviderCache();
    if (backend === 'disabled') return;
    console.log(
      `[providers] cache backend=${backend} · preloaded ${entries} episodes in ${Date.now() - startedAt} ms`,
    );
  } catch (error) {
    console.warn('[providers] cache preload failed:', error instanceof Error ? error.message : String(error));
  }
}
