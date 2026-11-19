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
  /* С 2026-11-19 preload по умолчанию ВЫКЛЮЧЕН. На холодном Vercel-инстансе
     выборка 60k строк `episode_source_urls` занимала минуты и параллельно
     выматывала Supabase: `/api/providers` уходил в таймаут и отдавал пустой
     список, поэтому плеер показывал «Собираем источники…» вместо видео.
     Источник правды читается точечно через `dbEpisodeSources()`; Redis остаётся
     горячим кэшем. Включать только для self-hosted: PROVIDER_CACHE_PRELOAD=1. */
  if ((process.env.PROVIDER_CACHE_PRELOAD ?? '0') === '0') return;

  /* ВАЖНО: прогрев не блокирует приём трафика (инцидент 2026-11-17).
     Раньше `register()` ждал полной выборки `episode_source_urls` — 346k строк,
     сотни запросов к Supabase. На холодном инстансе Vercel это минуты, и всё это
     время функция не отвечала вообще: страницы, постеры и плеер висели, хотя
     приложение было исправно. Теперь прогрев идёт фоном: первый резолв серии
     максимум сходит в провайдеры, зато сайт открывается сразу. */
  void (async () => {
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
  })();
}
