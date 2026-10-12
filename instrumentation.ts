/**
 * Next.js instrumentation: выполняется один раз при старте серверного процесса.
 *
 * Имя файла ОБЯЗАНО быть `instrumentation.ts`: детектор хука в Next 16
 * (build/index.js: instrumentationHookDetectionRegExp =
 * /^instrumentation\.(ts|tsx|js|jsx)$/) НЕ распознаёт `instrumentation.node.ts`.
 * Файл с суффиксом `.node` (состояние на 1483d1a) просто не компилировался как
 * хук: register() молча не вызывался на проде, прайм каталога и чисел серий не
 * происходил, и каждый холодный процесс вместо готового кэша из Supabase парсил
 * lib/data/titles.json (28 МБ) — лишний риск OOM/таймаута функции.
 *
 * Рантайм-_guard обязателен: instrumentation.ts Next собирает для ОБОИХ рантаймов
 * (nodejs и edge), поэтому динамические импорты ниже допускаются ТОЛЬКО под
 * проверкой NEXT_RUNTIME === 'nodejs' — в edge они не выполняются. Сборка
 * проверяется локально (`npm run build`) перед каждым деплоем.
 *
 * Что делает (аудит 2026-10, ТЗ 2.1 + задача 1): один раз при старте серверного
 * процесса подтягивает из Supabase каталог (public.titles) и свежие числа
 * «сколько серий вышло» (episode_progress / airing_progress / titles.episodes_released).
 * Пока прайм не завершился или если БД не настроена/недоступна, lib/catalog.ts и
 * lib/episodes.ts работают из lib/data/titles.json — деградации нет.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { primeCatalogFromDb } = await import('@/lib/catalog');
  const count = await primeCatalogFromDb().catch(() => 0);
  if (count) console.log(`[catalog] загружено из Supabase: ${count} тайтлов`);

  const { primeEpisodeData } = await import('@/lib/episode-data');
  const primed = await primeEpisodeData().catch(() => null);
  if (primed?.updated) {
    console.log(`[episodes] свежее число серий из БД (${primed.from.join('+')}): ${primed.updated} тайтлов`);
  }
}
